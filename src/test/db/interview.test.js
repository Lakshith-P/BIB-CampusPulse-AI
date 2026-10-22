// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addStudent, addUser, createTestDb, recordOf } from "./harness";
import * as iv from "@/backend/interview.server";
import { buildQuestionsPrompt, planTypes } from "@/lib/interview-prompt";

const RESUME =
  "Ravi Kumar. B.Tech CSE. Projects: Campus Cab, a ride sharing app built with Node.js and MongoDB. Internship: backend intern at Acme, built REST APIs. Skills: Python, SQL, Git.";
const txt = (text) => ({
  name: "resume.txt",
  type: "text/plain",
  base64: Buffer.from(text).toString("base64"),
});

const questions = {
  questions: [
    {
      type: "hr",
      question: "Tell me about yourself and why this role.",
      expected: "Clear story and motivation.",
    },
    {
      type: "resume",
      question: "On your Campus Cab project, how did you match riders to drivers?",
      expected: "Their real design.",
    },
    {
      type: "coding",
      question: "Write a function that returns the two numbers in a list that add to a target.",
      expected: "Hash map, O(n).",
      language: "python",
      starterCode: "def two_sum(nums, target):\n    pass\n",
    },
    {
      type: "aptitude",
      question: "A train 120 m long passes a pole in 6 seconds. What is its speed in km/h?",
      expected: "72 km/h.",
    },
  ],
};
const grade = (scores) => ({
  results: scores.map((score, index) => ({
    index,
    score,
    feedback: `Feedback ${index}`,
    better: "Model answer",
  })),
  summary: "A solid first attempt overall.",
  strengths: ["Clear communication"],
  improvements: ["Practise complexity analysis"],
});
const model = (...replies) => {
  let i = 0;
  return async () => replies[Math.min(i++, replies.length - 1)];
};

let ctx, db, ann, ben, teacher;
beforeAll(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  teacher = await addUser(db, "t@x.edu", "Teacher", ["faculty"]);
  ann = await addUser(db, "ann@x.edu", "Ann");
  ben = await addUser(db, "ben@x.edu", "Ben");
  await addStudent(db, "S-ANN", ann, teacher);
  await addStudent(db, "S-BEN", ben, teacher);
}, 60_000);
afterAll(() => ctx?.close());

describe("prompt", () => {
  it("spreads question types and puts the resume in only when asked", () => {
    expect(planTypes(["hr", "coding", "resume"], 7)).toEqual({ resume: 3, coding: 2, hr: 2 });
    const withR = buildQuestionsPrompt({
      role: "SDE",
      difficulty: "easy",
      types: ["resume", "hr"],
      count: 4,
      resumeText: RESUME,
    });
    const without = buildQuestionsPrompt({
      role: "SDE",
      difficulty: "easy",
      types: ["hr"],
      count: 4,
      resumeText: "",
    });
    expect(withR).toContain("Campus Cab");
    expect(without).not.toContain("<resume>");
  });
});

describe("resume", () => {
  it("reads a text resume, keeps it private and lets the student replace and remove it", async () => {
    expect(await iv.loadResume(db, ann)).toBeNull();
    const saved = await iv.saveResume(db, ann, { file: txt(RESUME) });
    expect(saved.text).toContain("Campus Cab");
    expect(saved.fileName).toBe("resume.txt");
    expect(await iv.loadResume(db, ben)).toBeNull();
    const edited = await iv.saveResume(db, ann, {
      text: `${RESUME} Also: hackathon winner at Techfest 2025.`,
    });
    expect(edited.text).toContain("Techfest");
    expect((await iv.downloadResume(db, ann)).name).toBe("resume.txt");
    await expect(iv.downloadResume(db, ben)).rejects.toThrow();
  });

  it("rejects the wrong type, empty text and users without a student record", async () => {
    await expect(
      iv.saveResume(db, ann, { file: { name: "a.png", type: "image/png", base64: "aGk=" } }),
    ).rejects.toThrow(/PDF, Word/);
    await expect(iv.saveResume(db, ann, { text: "too short" })).rejects.toThrow();
    const nobody = await addUser(db, "n@x.edu", "Nobody");
    await expect(iv.saveResume(db, nobody, { text: RESUME })).rejects.toThrow(/No student record/);
  });
});

describe("mock interview", () => {
  const input = {
    role: "Software Engineer",
    difficulty: "medium",
    types: ["hr", "resume", "coding", "aptitude"],
    count: 4,
  };
  let session;

  it("needs a resume for resume questions", async () => {
    await expect(
      iv.startInterview(db, ben, input, model(JSON.stringify(questions))),
    ).rejects.toThrow(/resume first/);
  });

  it("asks every type of question and never sends the expected answers to the browser", async () => {
    session = await iv.startInterview(
      db,
      ann,
      input,
      model("```json\n" + JSON.stringify(questions) + "\n```"),
    );
    expect(session.questions.map((q) => q.type)).toEqual(["hr", "resume", "coding", "aptitude"]);
    expect(session.questions[2]).toMatchObject({ language: "python" });
    expect(JSON.stringify(session)).not.toContain("expected");
    expect(JSON.stringify(session)).not.toContain("Hash map");
  });

  it("grades answers, computes the score itself, and adds a mock interview to the record", async () => {
    const before = (await recordOf(db, "S-ANN")).mockInterviews ?? 0;
    const result = await iv.submitInterview(
      db,
      ann,
      {
        id: session.id,
        answers: [
          { index: 0, answer: "I like building things.", code: "", language: "" },
          { index: 1, answer: "I used geohash buckets.", code: "", language: "" },
          {
            index: 2,
            answer: "Hash map approach",
            code: "def two_sum(n,t):\n  seen={}\n",
            language: "python",
          },
          // question 3 left unanswered
        ],
      },
      model(JSON.stringify(grade([8, 6, 10]))),
    );
    // (8 + 6 + 10 + 0) / 4 questions = 6.0 -> 60
    expect(result.overall).toBe(60);
    expect(result.questions[3]).toMatchObject({
      score: 0,
      feedback: expect.stringMatching(/did not answer/),
    });
    expect(result.byType.coding).toBe(100);
    expect((await recordOf(db, "S-ANN")).mockInterviews).toBe(before + 1);
    const log = await db.query(
      "SELECT interviewer, score FROM mock_interviews WHERE student_id = 'S-ANN'",
    );
    expect(log.rows[0]).toMatchObject({ interviewer: "AI mock interviewer" });
    expect(Number(log.rows[0].score)).toBe(60);
  });

  it("cannot be graded twice or by someone else, and the result stays private", async () => {
    await expect(
      iv.submitInterview(db, ann, { id: session.id, answers: [] }, model("{}")),
    ).rejects.toThrow(/already/);
    await expect(iv.getInterviewResult(db, ben, { id: session.id })).rejects.toThrow(/not found/);
    expect((await iv.getInterviewResult(db, ann, { id: session.id })).overall).toBe(60);
    expect(await iv.listInterviews(db, ben)).toEqual([]);
    await expect(iv.deleteInterview(db, ben, { id: session.id })).rejects.toThrow();
  });

  it("repairs a bad reply once, then fails without saving a session", async () => {
    let calls = 0;
    const flaky = async () => (++calls === 1 ? "oops" : JSON.stringify(questions));
    await iv.startInterview(db, ann, input, flaky);
    expect(calls).toBe(2);
    const count = async () =>
      (await db.query("SELECT count(*)::int AS n FROM interview_sessions")).rows[0].n;
    const before = await count();
    await expect(iv.startInterview(db, ann, input, model("nope"))).rejects.toThrow(/unusable/);
    expect(await count()).toBe(before);
  });
});
