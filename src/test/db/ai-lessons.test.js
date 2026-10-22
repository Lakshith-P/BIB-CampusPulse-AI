// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addStudent, addUser, createTestDb } from "./harness";
import * as ai from "@/backend/ai-lessons.server";
import { QUESTIONS, buildLearnerProfile } from "@/lib/ai-lesson-profile";
import { buildLessonPrompt } from "@/lib/ai-lesson-prompt";

const answersFor = (pick) => QUESTIONS.map((q) => ({ questionId: q.id, optionIds: [pick(q)] }));
const first = answersFor((q) => q.options[0].id);
const last = answersFor((q) => q.options[q.options.length - 1].id);

const slide = (n) => ({
  title: `Slide ${n}`,
  points: ["A complete point one", "A complete point two"],
  script: "So here we are, talking through this idea step by step, and it all fits together.",
  board: { keyTerms: ["term"], notes: ["a note"], diagram: { type: "flow", nodes: ["a", "b"] } },
});
const goodLesson = {
  title: "Limits in calculus",
  summary: "A short spoken recap of the whole lesson for you.",
  slides: [slide(1), slide(2), slide(3)],
  quiz: Array.from({ length: 4 }, (_, i) => ({
    question: `Question number ${i + 1}?`,
    options: ["a", "b", "c", "d"],
    correctIndex: i % 4,
    explanation: "Because of the lesson.",
  })),
};
const model = (text) => async () => text;

let ctx, db, ann, ben, teacher;

beforeAll(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  teacher = await addUser(db, "t@x.edu", "Teacher", ["faculty"]);
  ann = await addUser(db, "ann@x.edu", "Ann");
  ben = await addUser(db, "ben@x.edu", "Ben");
  const subjects = [{ subject: "Maths", marks: 70, classesHeld: 40, classesAttended: 36 }];
  await addStudent(db, "S-ANN", ann, teacher, { subjects });
  await addStudent(db, "S-BEN", ben, teacher, { subjects });
}, 60_000);

afterAll(() => ctx?.close());

describe("learning profile", () => {
  it("scores differently for different answers and rejects incomplete ones", () => {
    expect(buildLearnerProfile(first)).not.toEqual(buildLearnerProfile(last));
    expect(() => buildLearnerProfile(first.slice(1))).toThrow();
    expect(() =>
      buildLearnerProfile([{ questionId: "q1", optionIds: [] }, ...first.slice(1)]),
    ).toThrow();
  });

  it("adapts the prompt to the learner", () => {
    const base = { subject: "Maths", topic: "Limits", traits: buildLearnerProfile(first) };
    const a = buildLessonPrompt(base).prompt;
    const b = buildLessonPrompt({ ...base, traits: buildLearnerProfile(last) }).prompt;
    expect(a).not.toEqual(b);
  });

  it("stores the profile per user and bumps the version on a retake", async () => {
    expect(await ai.loadProfile(db, ann)).toBeNull();
    expect((await ai.saveProfile(db, ann, { answers: first })).version).toBe(1);
    expect((await ai.saveProfile(db, ann, { answers: last })).version).toBe(2);
    expect(await ai.loadProfile(db, ben)).toBeNull();
  });
});

describe("AI lessons", () => {
  const input = { subject: "Maths", topic: "Limits", focus: "", detailLevel: "standard" };

  it("needs a profile first", async () => {
    await expect(
      ai.createLesson(db, ben, input, model(JSON.stringify(goodLesson))),
    ).rejects.toThrow(/questionnaire/);
  });

  it("only creates lessons for the student's own subjects", async () => {
    await expect(
      ai.createLesson(
        db,
        ann,
        { ...input, subject: "Chemistry" },
        model(JSON.stringify(goodLesson)),
      ),
    ).rejects.toThrow(/own subjects/);
    await expect(
      ai.createLesson(db, teacher, input, model(JSON.stringify(goodLesson))),
    ).rejects.toThrow();
  });

  it("stores a valid lesson, tolerating fenced JSON, and keeps it private to its owner", async () => {
    const lesson = await ai.createLesson(
      db,
      ann,
      input,
      model("```json\n" + JSON.stringify(goodLesson) + "\n```"),
    );
    expect(lesson.content.slides).toHaveLength(3);
    expect((await ai.listLessons(db, ann)).map((l) => l.id)).toEqual([lesson.id]);
    expect(await ai.listLessons(db, ben)).toEqual([]);
    await expect(ai.getLesson(db, ben, { id: lesson.id })).rejects.toThrow(/not found/);
    await expect(ai.deleteLesson(db, ben, { id: lesson.id })).rejects.toThrow(/not found/);
  });

  it("repairs once, then fails without saving anything", async () => {
    let calls = 0;
    const flaky = async () => (++calls === 1 ? "not json" : JSON.stringify(goodLesson));
    await ai.createLesson(db, ann, input, flaky);
    expect(calls).toBe(2);

    const before = (await ai.listLessons(db, ann)).length;
    await expect(ai.createLesson(db, ann, input, model("still not json"))).rejects.toThrow(
      /unusable/,
    );
    expect((await ai.listLessons(db, ann)).length).toBe(before);
  });

  it("records the best quiz score and deletes", async () => {
    const [{ id }] = await ai.listLessons(db, ann);
    await ai.recordQuiz(db, ann, { id, score: 3, total: 4 });
    await ai.recordQuiz(db, ann, { id, score: 1, total: 4 });
    expect((await ai.getLesson(db, ann, { id })).quizBest).toBe(3);
    await expect(ai.recordQuiz(db, ann, { id, score: 2, total: 9 })).rejects.toThrow();
    await expect(ai.recordQuiz(db, ben, { id, score: 2, total: 4 })).rejects.toThrow();
    await ai.deleteLesson(db, ann, { id });
    await expect(ai.getLesson(db, ann, { id })).rejects.toThrow(/not found/);
  });
});
