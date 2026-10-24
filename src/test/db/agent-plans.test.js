// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { addStudent, addUser, createTestDb } from "./harness";
import {
  getAgentPlans,
  runAcademicAgent,
  runCareerAgent,
  setPlanItem,
} from "@/backend/agent-plans.server";

let ctx;
let db;
let student, other, teacher, admin;

const research = {
  slug: "cyber-security",
  sources: [
    {
      id: "S1",
      kind: "roadmap",
      title: "Cyber Security roadmap",
      url: "https://roadmap.sh/cyber-security",
      content: "1. Networking: TCP/IP, DNS\n2. Operating Systems: Linux",
      stages: [
        { name: "Networking", items: ["TCP/IP", "DNS", "CompTIA Security+"] },
        { name: "Operating Systems", items: ["Linux", "Windows"] },
      ],
    },
  ],
  trace: [{ step: "Published roadmap", note: "Read 2 stages." }],
};
const fakeResearch = async () => research;
const noModel = () => false;

beforeAll(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  student = await addUser(db, "s@x.edu", "Student");
  other = await addUser(db, "o@x.edu", "Other");
  teacher = await addUser(db, "t@x.edu", "Teacher", ["faculty"]);
  admin = await addUser(db, "a@x.edu", "Admin", ["admin"]);
  await addStudent(db, "S-ME", student, teacher, {
    cgpa: 6.8,
    semester: 4,
    semesterGrades: [6.2, 6.6, 7.0],
    skills: { coding: 35, aptitude: 70, analytical: 60, verbal: -1, communication: 55 },
    resumeCompleteness: 50,
    mockInterviews: 0,
    subjects: [
      { subject: "Math", marks: 32, classesHeld: 40, classesAttended: 24 },
      { subject: "Coding", marks: 82, classesHeld: 40, classesAttended: 38 },
    ],
  });
  await addStudent(db, "S-OTHER", other, teacher, { cgpa: 8 });
}, 60_000);

afterAll(async () => {
  await ctx?.close();
});

const texts = (run) => run.plan.phases.flatMap((phase) => phase.items.map((item) => item.text));

describe("placement agent", () => {
  it("researches the role, compares it with the student and stores a roadmap", async () => {
    const run = await runCareerAgent(
      db,
      student,
      { role: "Cyber Security" },
      { research: fakeResearch, llm: noModel },
    );
    expect(run.plan.role).toBe("Cyber Security");
    expect(run.plan.gaps.find((g) => g.skill === "coding")).toMatchObject({
      value: 35,
      status: "gap",
    });
    expect(texts(run).join("\n")).toContain("Learn Networking");
    expect(texts(run).join("\n")).toContain("Raise coding from 35");
    expect(run.sources[0].url).toBe("https://roadmap.sh/cyber-security");
    expect(run.model).toBe("rules");
    expect(run.trace.some((t) => t.step === "Plan")).toBe(true);
  });

  it("does not repeat finished steps on the next run and reports what changed", async () => {
    const first = (await getAgentPlans(db, student)).placement;
    const done = first.plan.phases[0].items[0];
    await setPlanItem(db, student, { planId: first.id, itemId: done.id, done: true });
    await db.query(
      "UPDATE student_records SET record = jsonb_set(record, '{skills,coding}', '50') WHERE id = 'S-ME'",
    );
    const second = await runCareerAgent(
      db,
      student,
      { role: "cyber security" },
      { research: fakeResearch, llm: noModel },
    );
    expect(texts(second)).not.toContain(done.text);
    expect(second.plan.changes.join(" ")).toContain("coding moved from 35 to 50");
    expect(second.plan.changes.join(" ")).toContain("completed last time");
    expect(second.progress.done).toBe(0);
  });

  it("uses the model's plan when it is valid, and falls back when it is not", async () => {
    const good = {
      summary: "A focused plan for the cyber security path built from the roadmap sources.",
      requirements: [
        { name: "Networking", why: "Core of the roadmap", sourceId: "S1" },
        { name: "Linux", why: "Needed for tooling", sourceId: "S1" },
        { name: "Security+", why: "Entry certification", sourceId: "S1" },
      ],
      certifications: [{ name: "CompTIA Security+", note: "Named in S1" }],
      phases: [
        {
          title: "Foundations",
          weeks: "Weeks 1-4",
          goal: "Basics",
          items: [
            {
              text: "Capture and read a DNS lookup in Wireshark this week",
              type: "practice",
              sourceId: "S1",
            },
          ],
        },
        {
          title: "Practice",
          weeks: "Weeks 5-8",
          goal: "Labs",
          items: [
            { text: "Finish ten TryHackMe rooms on network attacks by week 8", type: "practice" },
          ],
        },
      ],
      checkpoint: "Re-run after week 4.",
    };
    const write = vi.fn(async () => ({
      text: `Here you go:\n${JSON.stringify(good)}`,
      model: "test-model",
    }));
    const run = await runCareerAgent(
      db,
      student,
      { role: "Cyber Security" },
      { research: fakeResearch, llm: () => true, write },
    );
    expect(run.model).toBe("test-model");
    expect(texts(run)).toContain("Finish ten TryHackMe rooms on network attacks by week 8");
    const prompt = write.mock.calls[0][0].prompt;
    expect(prompt).toContain("completedBefore");
    expect(write.mock.calls[0][0].system).toContain("Return ONLY one JSON object");

    const broken = vi.fn(async () => ({ text: "not json", model: "m" }));
    const fallback = await runCareerAgent(
      db,
      student,
      { role: "Cyber Security" },
      { research: fakeResearch, llm: () => true, write: broken },
    );
    expect(fallback.model).toBe("rules");
    expect(broken).toHaveBeenCalledTimes(2);
    expect(fallback.trace.find((t) => t.step === "Plan").note).toContain("built-in");
  });

  it("only runs for the student's own record", async () => {
    await expect(
      runCareerAgent(db, teacher, { role: "DevOps" }, { research: fakeResearch, llm: noModel }),
    ).rejects.toThrow(/No student record/);
    await expect(
      runCareerAgent(db, student, { role: "x" }, { research: fakeResearch }),
    ).rejects.toThrow(/role/);
  });
});

describe("academic agent", () => {
  it("projects the trend and builds a numbered plan from the student's own results", async () => {
    const run = await runAcademicAgent(db, student, { targetCgpa: 7.5 }, { llm: noModel });
    expect(run.plan.outlook.projection.direction).toBe("improving");
    expect(run.plan.outlook.target.requiredAverageSgpa).toBeCloseTo(7.92, 2);
    expect(texts(run).join("\n")).toContain("Math (marks 32");
    expect(run.sources).toEqual([]);
  });

  it("remembers finished steps and notices improved marks", async () => {
    const before = (await getAgentPlans(db, student)).academic;
    const step = before.plan.phases[0].items[0];
    await setPlanItem(db, student, { planId: before.id, itemId: step.id, done: true });
    await db.query(
      `UPDATE student_records SET record = jsonb_set(record, '{subjects,0,marks}', '48') WHERE id = 'S-ME'`,
    );
    const after = await runAcademicAgent(db, student, { targetCgpa: 7.5 }, { llm: noModel });
    expect(after.plan.changes).toContain("Math marks rose from 32 to 48.");
    expect(texts(after)).not.toContain(step.text);
  });

  it("refuses to analyse a student with no results", async () => {
    await addStudent(db, "S-EMPTY", await addUser(db, "e@x.edu", "Empty"), teacher, {});
    const empty = (await db.query("SELECT id FROM users WHERE email = 'e@x.edu'")).rows[0];
    await expect(
      runAcademicAgent(db, { id: empty.id, roles: ["student"] }, {}, { llm: noModel }),
    ).rejects.toThrow(/not recorded/);
  });
});

describe("access", () => {
  it("lets staff read but not tick or run, and hides plans from other students", async () => {
    const seen = await getAgentPlans(db, teacher, { studentId: "S-ME" });
    expect(seen.canRun).toBe(false);
    expect(seen.placement).not.toBeNull();
    expect((await getAgentPlans(db, admin, { studentId: "S-ME" })).academic).not.toBeNull();
    await expect(getAgentPlans(db, other, { studentId: "S-ME" })).rejects.toThrow(/not available/);
    const plan = seen.placement;
    const item = plan.plan.phases[0].items[0];
    await expect(
      setPlanItem(db, teacher, { planId: plan.id, itemId: item.id, done: true }),
    ).rejects.toThrow(/not available/);
    await expect(
      setPlanItem(db, other, { planId: plan.id, itemId: item.id, done: true }),
    ).rejects.toThrow(/not available/);
    await expect(
      setPlanItem(db, student, { planId: plan.id, itemId: "nope", done: true }),
    ).rejects.toThrow(/not part/);
  });
});
