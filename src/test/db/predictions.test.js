// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { addStudent, addUser, createTestDb } from "./harness";
import { setPlanItem } from "@/backend/agent-plans.server";
import {
  addExamScore,
  addTeacherRating,
  deleteExamScore,
  getStudentPrediction,
  listPredictionInputs,
  listPredictions,
  runPredictionAgent,
  runPredictionCoach,
  saveCodingProfile,
  sendRiskAlerts,
} from "@/backend/predictions.server";

let ctx, db;
let student, otherStudent, teacher, otherTeacher, admin;

const research = {
  slug: "backend",
  sources: [
    { id: "S1", kind: "reference", title: "Backend", url: "https://x.test", content: "APIs" },
  ],
  trace: [{ step: "Reference", note: "ok" }],
};

beforeAll(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  student = await addUser(db, "s@x.edu", "Student");
  otherStudent = await addUser(db, "o@x.edu", "Other");
  teacher = await addUser(db, "t@x.edu", "Teacher", ["faculty"]);
  otherTeacher = await addUser(db, "t2@x.edu", "Teacher 2", ["faculty"]);
  admin = await addUser(db, "a@x.edu", "Admin", ["admin"]);
  await addStudent(db, "S-ME", student, teacher, {
    cgpa: 6.5,
    mockInterviews: 0,
    resumeCompleteness: 45,
    skills: { coding: 40, aptitude: 45, analytical: 50, verbal: 50, communication: 50 },
    subjects: [
      { subject: "Math", marks: 30, classesHeld: 40, classesAttended: 24 },
      { subject: "Coding", marks: 80, classesHeld: 40, classesAttended: 38 },
    ],
  });
  await addStudent(db, "S-OTHER", otherStudent, otherTeacher, { cgpa: 9, resumeCompleteness: 90 });
}, 60_000);

afterAll(async () => {
  await ctx?.close();
});

const exam = (over) => ({
  studentId: "S-ME",
  subject: "Math",
  kind: "mid1",
  score: 10,
  max: 50,
  takenOn: "2026-09-01",
  ...over,
});

describe("inputs and access", () => {
  it("lets a teacher record exam scores and ratings only for their own students", async () => {
    await addExamScore(db, teacher, exam({}));
    await addExamScore(db, teacher, exam({ kind: "mid2", score: 12, takenOn: "2026-10-01" }));
    await addExamScore(
      db,
      teacher,
      exam({ kind: "continuous", title: "Quiz 1", score: 3, max: 10 }),
    );
    await addExamScore(db, teacher, exam({ subject: "Coding", score: 44 }));
    await addExamScore(db, teacher, exam({ subject: "Coding", kind: "mid2", score: 46 }));
    await addTeacherRating(db, teacher, { studentId: "S-ME", rating: 2, comment: "Often absent" });
    await expect(addExamScore(db, otherTeacher, exam({}))).rejects.toThrow();
    await expect(addExamScore(db, teacher, exam({ score: 60 }))).rejects.toThrow(
      /higher than the maximum/,
    );
    await expect(addExamScore(db, student, exam({}))).rejects.toThrow();
  });

  it("lets the student keep their own LeetCode numbers, and only their own", async () => {
    await saveCodingProfile(db, student, { username: "me", easy: 12, medium: 3, hard: 0 });
    const inputs = await listPredictionInputs(db, student);
    expect(inputs.coding).toMatchObject({ easy: 12, medium: 3, leetcode_username: "me" });
    expect(inputs.exams).toHaveLength(5);
    await expect(listPredictionInputs(db, otherStudent, { studentId: "S-ME" })).rejects.toThrow(
      /not available/,
    );
    const seen = await listPredictionInputs(db, teacher, { studentId: "S-ME" });
    expect(seen.canEditCoding).toBe(false);
  });

  it("prefers the LeetCode account a student linked over numbers entered by hand", async () => {
    await db.query(
      `INSERT INTO leetcode_accounts (user_id, username, total_solved, easy_solved, medium_solved, hard_solved, contest_rating)
       VALUES ($1, 'linkedme', 60, 30, 25, 5, 1623.4)`,
      [student.id],
    );
    const coding = (await listPredictionInputs(db, student)).coding;
    expect(coding).toMatchObject({
      source: "leetcode",
      easy: 30,
      medium: 25,
      hard: 5,
      contest_rating: 1623,
    });
    const prediction = await getStudentPrediction(db, student);
    expect(prediction.placement.components.find((c) => c.key === "leetcode").detail).toContain(
      "30E / 25M / 5H",
    );
    await db.query("DELETE FROM leetcode_accounts WHERE user_id = $1", [student.id]);
    expect((await listPredictionInputs(db, student)).coding).toMatchObject({
      source: "manual",
      easy: 12,
    });
  });

  it("deletes a score only for someone who can see the student", async () => {
    const id = (await listPredictionInputs(db, teacher, { studentId: "S-ME" })).exams[0].id;
    await expect(deleteExamScore(db, otherTeacher, { id })).rejects.toThrow();
    await deleteExamScore(db, teacher, { id });
  });
});

describe("predictions by role", () => {
  it("shows each person the predictions they may see, with the drivers", async () => {
    const mine = await getStudentPrediction(db, student);
    expect(mine.result.subjects.find((s) => s.subject === "Math").predicted).toBeLessThan(55);
    expect(mine.placement.score).not.toBeNull();
    expect(mine.risk.level).toBe("High");
    expect(mine.actions.length).toBeGreaterThan(2);
    expect((await getStudentPrediction(db, teacher, { studentId: "S-ME" })).studentId).toBe("S-ME");
    await expect(getStudentPrediction(db, otherTeacher, { studentId: "S-ME" })).rejects.toThrow(
      /not available/,
    );
  });

  it("lists only the teacher's own students, and everyone for an administrator", async () => {
    expect((await listPredictions(db, teacher)).map((r) => r.id)).toEqual(["S-ME"]);
    expect((await listPredictions(db, admin)).map((r) => r.id)).toEqual(["S-ME", "S-OTHER"]);
    expect(await listPredictions(db, admin, { branch: "ECE" })).toEqual([]);
    await expect(listPredictions(db, student)).rejects.toThrow();
  });
});

describe("cohort agent and alerts", () => {
  const notes = async (userId) =>
    (
      await db.query(
        "SELECT title, priority, dedupe_key FROM notifications WHERE user_id = $1 AND area = 'Prediction' ORDER BY created_at",
        [userId],
      )
    ).rows;

  it("scores everyone, stores the run, and alerts the teacher, the admin and the student", async () => {
    const out = await runPredictionAgent(db, admin, {}, { llm: () => false });
    expect(out.scope.students).toBe(2);
    expect(out.levels.High).toBe(1);
    expect(out.watchlist[0].id).toBe("S-ME");
    expect(out.watchlist[0].risk.reasons.length).toBeGreaterThan(0);
    expect(out.watchlist[0].actions[0].owner).toBeTruthy();
    expect(out.byBranch[0].branch).toBe("CSE");
    expect(out.narrative.text).toContain("1 of 2 students are high risk");
    const stored = await db.query(
      "SELECT count(*)::int AS n FROM student_predictions WHERE run_id = $1",
      [out.runId],
    );
    expect(stored.rows[0].n).toBe(2);
    expect((await notes(teacher.id)).map((n) => n.title)).toEqual([
      "High risk: Student S-ME (S-ME)",
    ]);
    expect((await notes(admin.id)).length).toBe(1);
    expect((await notes(student.id))[0].title).toContain("High risk");
    expect(await notes(otherStudent.id)).toEqual([]);
    expect(await notes(otherTeacher.id)).toEqual([]);
  });

  it("does not repeat alerts when the agent runs again the same week", async () => {
    const before = (await notes(teacher.id)).length;
    const again = await runPredictionAgent(db, teacher, {}, { llm: () => false });
    expect(again.scope.students).toBe(1);
    expect((await notes(teacher.id)).length).toBe(before);
    expect((await notes(admin.id)).length).toBe(1);
  });

  it("alerts when risk rises from a lower level, even if it is only Medium", async () => {
    const row = { id: "S-ME", owner_id: null, faculty_id: teacher.id, record: { name: "X" } };
    const prediction = {
      risk: { level: "Medium", reasons: ["Attendance below 75% in Math."] },
      actions: [],
    };
    expect(
      await sendRiskAlerts(db, [{ row, prediction, previousLevel: "Low" }], { admins: [] }),
    ).toBe(1);
    expect(
      await sendRiskAlerts(db, [{ row, prediction, previousLevel: "Medium" }], { admins: [] }),
    ).toBe(0);
  });

  it("uses the model's briefing when it answers", async () => {
    const write = vi.fn(async () => ({
      text: "One student is high risk; act on Math attendance first.",
      model: "test-model",
    }));
    const out = await runPredictionAgent(db, admin, {}, { write, llm: () => true });
    expect(out.narrative).toEqual({
      text: "One student is high risk; act on Math attendance first.",
      model: "test-model",
    });
    expect(write.mock.calls[0][0].prompt).toContain("STATISTICS");
  });
});

describe("student coach", () => {
  it("ranks sections by gain x market importance, plans with numbers, then does not repeat", async () => {
    const run = await runPredictionCoach(
      db,
      student,
      { role: "Backend Developer" },
      { research: async () => research, llm: () => false },
    );
    expect(run.plan.prediction.risk.level).toBe("High");
    expect(run.plan.sections[0].priority).toBeGreaterThanOrEqual(run.plan.sections.at(-1).priority);
    expect(run.marketBasis).toContain("General hiring priors");
    const texts = run.plan.phases.flatMap((p) => p.items.map((i) => i.text));
    expect(texts.join("\n")).toContain("owner: Training & placement cell");
    expect(texts.join("\n")).toContain("Math");

    const first = run.plan.phases[0].items[0];
    await setPlanItem(db, student, { planId: run.id, itemId: first.id, done: true });
    const second = await runPredictionCoach(
      db,
      student,
      { role: "backend developer" },
      { research: async () => research, llm: () => false },
    );
    expect(second.plan.phases.flatMap((p) => p.items.map((i) => i.text))).not.toContain(first.text);
    expect(second.plan.changes.join(" ")).toContain("completed last time");
  });

  it("takes importance and market notes from the model when it reads the sources", async () => {
    const reply = {
      summary: "Backend hiring emphasises data structures and clear communication.",
      trends: [{ note: "Roadmap lists algorithms first.", sourceId: "S1" }],
      importance: { leetcode: 5, aptitude: 2, cgpa: 2, mock: 3, resume: 2 },
    };
    const write = vi.fn(async () => ({ text: JSON.stringify(reply), model: "m" }));
    const run = await runPredictionCoach(
      db,
      student,
      { role: "Backend Developer" },
      { research: async () => research, llm: () => true, write },
    );
    expect(run.model).toBe("m");
    expect(run.plan.trends[0].note).toContain("Roadmap");
    expect(run.plan.sections[0].key).toBe("leetcode");
    expect(run.marketBasis).toContain("live source");
  });
});
