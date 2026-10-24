// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addStudent, addUser, createTestDb } from "./harness";
import { askCopilot, buildTools, loadScope, modelChain } from "@/backend/copilot.server";

const TODAY = "2026-10-24";
const att = (attended) => [
  { subject: "Maths", marks: 40, classesHeld: 40, classesAttended: attended },
];
const exec = (tools, name, input) => tools[name].execute(input, { toolCallId: "t", messages: [] });

let ctx, db, dean, teacher, other;

beforeAll(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  dean = { ...(await addUser(db, "dean@x.edu", "Dean", ["admin"])), roles: ["admin"] };
  teacher = { ...(await addUser(db, "t@x.edu", "Teacher", ["faculty"])), roles: ["faculty"] };
  other = { ...(await addUser(db, "o@x.edu", "Other", ["faculty"])), roles: ["faculty"] };
  await addStudent(db, "S-LOW", null, teacher, { name: "Low Attender", subjects: att(20) });
  await addStudent(db, "S-OK", null, teacher, { name: "Fine Student", subjects: att(39) });
  await addStudent(db, "S-THEIRS", null, other, { name: "Not Mine", subjects: att(10) });
}, 60_000);

afterAll(() => ctx?.close());

describe("analytics copilot", () => {
  it("only reaches records the caller may see", async () => {
    expect((await loadScope(db, teacher, TODAY)).rows.map((r) => r.id).sort()).toEqual([
      "S-LOW",
      "S-OK",
    ]);
    expect((await loadScope(db, dean, TODAY)).rows).toHaveLength(3);
    const student = { id: "x", roles: [] };
    await expect(loadScope(db, student, TODAY)).rejects.toThrow(/teachers and deans/);
  });

  it("records the exact rows each tool used as evidence", async () => {
    const scope = await loadScope(db, teacher, TODAY);
    const evidence = [];
    const tools = buildTools(scope, TODAY, evidence);
    const res = await exec(tools, "find_students", {
      filters: { maxAttendance: 74 },
      sortBy: "attendance",
      order: "asc",
      limit: 10,
    });
    expect(res.students.map((s) => s.id)).toEqual(["S-LOW"]);
    expect(res.evidenceId).toBe("E1");
    expect(evidence[0].rows[0]).toMatchObject({ id: "S-LOW", attendance: 50 });
    expect(evidence[0].total).toBe(1);
    // A teacher can never look up another teacher's student.
    const miss = await exec(tools, "student_profile", { student: "S-THEIRS" });
    expect(miss.error).toMatch(/No student/);
    expect(evidence).toHaveLength(1);
  });

  it("groups summaries and counts support actions", async () => {
    const scope = await loadScope(db, dean, TODAY);
    const evidence = [];
    const tools = buildTools(scope, TODAY, evidence);
    const sum = await exec(tools, "cohort_summary", { groupBy: "branch" });
    expect(sum.groups[0]).toMatchObject({ group: "CSE", students: 3 });
    const drivers = await exec(tools, "score_drivers", {});
    expect(drivers.indicators.some((i) => i.kind === "Score component")).toBe(true);
    const actions = await exec(tools, "support_actions", { status: "any", overdueOnly: false });
    expect(actions.counts.open).toBe(0);
    expect(evidence.map((e) => e.id)).toEqual(["E1", "E2", "E3"]);
  });

  it("refuses to run without a configured model", async () => {
    const saved = process.env["LLM_API_KEY"];
    delete process.env["LLM_API_KEY"];
    await expect(askCopilot(db, dean, { question: "Who is at risk?" }, TODAY)).rejects.toThrow(
      /not configured/,
    );
    if (saved) process.env["LLM_API_KEY"] = saved;
  });
});

describe("model chain", () => {
  it("tries the main model first and Grok as the fallback", () => {
    expect(modelChain({})).toEqual([]);
    const both = modelChain({ LLM_API_KEY: "a", GROK_API_KEY: "b" });
    expect(both.at(-1).name).toBe("grok");
    expect(both[0].name).toBe("primary");
    expect(both.length).toBeGreaterThan(2);
    expect(both.at(-1)).toMatchObject({ baseURL: "https://api.x.ai/v1" });
    expect(modelChain({ GROK_API_KEY: "b" }).map((m) => m.name)).toEqual(["grok"]);
  });
});

describe("Groq", () => {
  it("is tried first, ahead of Gemini and Grok, when its key is set", () => {
    const chain = modelChain({ GROQ_API_KEY: "g", LLM_API_KEY: "a", GROK_API_KEY: "b" });
    expect(chain[0]).toMatchObject({
      name: "groq",
      baseURL: "https://api.groq.com/openai/v1",
      model: "llama-3.3-70b-versatile",
    });
    expect(chain.at(-1).name).toBe("grok");
    expect(modelChain({ GROQ_API_KEY: "g" }).map((m) => m.name)).toEqual(["groq"]);
  });
});
