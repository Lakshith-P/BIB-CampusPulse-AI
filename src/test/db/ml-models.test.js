// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addStudent, addUser, createTestDb } from "./harness";
import {
  MODELS,
  getModelReport,
  learnedPredictions,
  trainModels,
  trainOne,
} from "@/backend/ml-models.server";

let ctx, db;
let admin, teacher, student, stranger;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SUBJECTS = ["Math", "Physics", "Coding"];

beforeAll(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  admin = await addUser(db, "a@x.edu", "Admin", ["admin"]);
  teacher = await addUser(db, "t@x.edu", "Teacher", ["faculty"]);
  stranger = await addUser(db, "z@x.edu", "Stranger");
  const r = rng(7);
  for (let i = 0; i < 70; i++) {
    const owner = i === 0 ? (student = await addUser(db, "s@x.edu", "Student")) : null;
    const ability = 35 + r() * 55; // a hidden level the marks depend on
    const att = 55 + r() * 40;
    const subjects = SUBJECTS.map((subject) => ({
      subject,
      marks: Math.max(5, Math.min(99, ability + (att - 75) * 0.3 + (r() - 0.5) * 12)),
      classesHeld: 40,
      classesAttended: Math.round((att / 100) * 40),
    }));
    const grades = Array.from({ length: 3 + (i % 3) }, (_, k) =>
      Math.max(3, Math.min(9.8, ability / 10 + k * 0.1 + (r() - 0.5))),
    );
    const id = `S${String(i).padStart(2, "0")}`;
    await addStudent(db, id, owner, teacher, {
      cgpa: Math.round((ability / 10) * 10) / 10,
      resumeCompleteness: Math.round(ability),
      skills: {
        coding: 50,
        aptitude: Math.round(ability + (r() - 0.5) * 10),
        analytical: 50,
        verbal: 50,
        communication: 50,
      },
      semesterGrades: grades,
      subjects,
    });
    for (const s of subjects)
      for (const [kind, max] of [
        ["mid1", 50],
        ["mid2", 50],
        ["continuous", 10],
      ])
        await db.query(
          "INSERT INTO exam_scores (student_id, subject, kind, score, max_score) VALUES ($1,$2,$3,$4,$5)",
          [
            id,
            s.subject,
            kind,
            Math.max(0, Math.min(max, ((s.marks + (r() - 0.5) * 10) / 100) * max)),
            max,
          ],
        );
    await db.query(
      "INSERT INTO coding_profiles (student_id, easy, medium, hard) VALUES ($1,$2,$3,$4)",
      [id, Math.round(ability), Math.round(ability / 3), Math.round(ability / 12)],
    );
    await db.query("INSERT INTO mock_interviews (student_id, score) VALUES ($1,$2)", [
      id,
      Math.max(0, Math.min(100, ability + (r() - 0.5) * 14)),
    ]);
  }
}, 120_000);

afterAll(async () => {
  await ctx?.close();
});

describe("training", () => {
  it("only an administrator can train", async () => {
    await expect(trainModels(db, teacher)).rejects.toThrow();
    await expect(trainModels(db, student)).rejects.toThrow();
  });

  it("trains all three models, stores them and reports honest cross-validated metrics", async () => {
    const out = await trainModels(db, admin);
    expect(out.map((o) => o.key).sort()).toEqual(Object.keys(MODELS).sort());
    expect(out.every((o) => o.trained)).toBe(true);
    const report = await getModelReport(db, teacher);
    const result = report.find((m) => m.key === "result_marks");
    expect(result.rows).toBeGreaterThan(150);
    expect(result.metrics.r2).toBeGreaterThan(0.7);
    expect(result.metrics.mae).toBeLessThan(
      result.metrics.baselines["Always predict the average"].mae,
    );
    expect(result.metrics.effects.map((e) => e.feature)).toContain("Attendance %");
    const fail = result.metrics.decisions.find((d) => d.name === "Needs attention");
    expect(fail.accuracy).toBeGreaterThan(0.7);
    expect(fail.f1).toBeGreaterThan(0.5);
    expect(fail.confusion.tp + fail.confusion.fn).toBe(fail.support);
    expect(
      report.find((m) => m.key === "next_sgpa").metrics.baselines["Repeat the last SGPA"],
    ).toBeTruthy();
    await expect(getModelReport(db, stranger)).rejects.toThrow();
  });

  it("refuses to train on too little data", () => {
    const out = trainOne("interview_score", [{ group: "a", x: [1, 2, 3, 4], y: 5, meta: {} }]);
    expect(out.trained).toBe(false);
    expect(out.reason).toContain("at least");
  });
});

describe("predictions with confidence", () => {
  it("predicts each subject with an interval, a confidence, drivers and ranked improvements", async () => {
    const mine = await learnedPredictions(db, student);
    expect(mine.result.subjects).toHaveLength(3);
    const s = mine.result.subjects[0];
    expect(s.value).toBeGreaterThan(0);
    expect(s.interval.low).toBeLessThan(s.value);
    expect(s.interval.high).toBeGreaterThan(s.value);
    expect(s.headline.confidence).toBeGreaterThanOrEqual(0.5);
    expect(s.headline.confidence).toBeLessThanOrEqual(1);
    expect(s.drivers[0]).toHaveProperty("effect");
    expect(mine.result.reliability.decisions[0]).toMatchObject({ name: "Fail" });
    for (let i = 1; i < s.improve.length; i++)
      expect(s.improve[i - 1].gain).toBeGreaterThanOrEqual(s.improve[i].gain);
  });

  it("also predicts the next SGPA and the interview score", async () => {
    const mine = await learnedPredictions(db, student);
    expect(mine.nextSgpa.value).toBeGreaterThan(0);
    expect(mine.nextSgpa.value).toBeLessThanOrEqual(10);
    expect(typeof mine.nextSgpa.improves).toBe("boolean");
    expect(mine.interview.value).toBeGreaterThan(0);
    expect(mine.interview.reliability.decisions.map((d) => d.name)).toContain(
      "Not interview-ready",
    );
  });

  it("follows the same access rules as the other predictions", async () => {
    expect((await learnedPredictions(db, teacher, { studentId: "S00" })).studentId).toBe("S00");
    await expect(learnedPredictions(db, stranger, { studentId: "S00" })).rejects.toThrow(
      /not available/,
    );
    expect((await learnedPredictions(db, admin, { studentId: "S05" })).studentId).toBe("S05");
  });
});
