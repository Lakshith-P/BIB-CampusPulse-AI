import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";

import { buildLearnerProfile } from "@/lib/ai-lesson-profile";
import { generateLesson } from "@/lib/ai-lesson-prompt";
import { requireOwnStudent, subjectsOf } from "./access.server.js";

// Personalised AI video lessons. A student's learning profile comes from the psychology
// questionnaire; lessons are generated server-side for one of their own LMS subjects, so the
// prompt, the provider key and the model call never reach the browser.

export const modelCaller = () => {
  const apiKey = process.env["LLM_API_KEY"];
  if (!apiKey)
    throw new Error("AI lessons are not configured yet. Ask an administrator to set LLM_API_KEY.");
  const provider = createOpenAICompatible({
    name: "llm",
    apiKey,
    baseURL:
      process.env["LLM_BASE_URL"] ?? "https://generativelanguage.googleapis.com/v1beta/openai/",
  });
  const model = provider.chatModel(process.env["LLM_MODEL"] ?? "gemini-2.5-flash");
  return async (prompt) => (await generateText({ model, prompt, temperature: 0.7 })).text;
};

const summary = (r) => ({
  id: r.id,
  subject: r.subject,
  unit: r.unit,
  topic: r.topic,
  title: r.content.title,
  slides: r.content.slides.length,
  quizBest: r.quiz_best,
  quizTotal: r.quiz_total,
  createdAt: new Date(r.created_at).toISOString(),
});

export async function loadProfile(db, user) {
  const { rows } = await db.query(
    "SELECT traits, version, updated_at FROM learning_profiles WHERE user_id = $1",
    [user.id],
  );
  const r = rows[0];
  return r
    ? { traits: r.traits, version: r.version, updatedAt: new Date(r.updated_at).toISOString() }
    : null;
}

/** Scores the questionnaire and stores the profile; retaking replaces it and bumps the version. */
export async function saveProfile(db, user, { answers }) {
  const traits = buildLearnerProfile(answers);
  await db.query(
    `INSERT INTO learning_profiles(user_id, answers, traits)
     VALUES($1,$2,$3)
     ON CONFLICT (user_id) DO UPDATE
       SET answers = $2, traits = $3, version = learning_profiles.version + 1, updated_at = now()`,
    [user.id, JSON.stringify(answers), JSON.stringify(traits)],
  );
  return loadProfile(db, user);
}

export async function listLessons(db, user) {
  const { rows } = await db.query(
    `SELECT id, subject, unit, topic, content, quiz_best, quiz_total, created_at
       FROM ai_lessons WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [user.id],
  );
  return rows.map(summary);
}

export async function getLesson(db, user, { id }) {
  const { rows } = await db.query("SELECT * FROM ai_lessons WHERE id = $1 AND owner_id = $2", [
    id,
    user.id,
  ]);
  if (!rows[0]) throw new Error("That lesson was not found.");
  return { ...summary(rows[0]), content: rows[0].content, traits: rows[0].traits };
}

/**
 * Generates and stores a lesson. `callModel` is injectable so tests never reach a provider.
 * The row is written only after the lesson validated, and only then is it returned.
 */
export async function createLesson(
  db,
  user,
  { subject, unit, topic, focus, detailLevel, durationMin },
  callModel = modelCaller(),
) {
  const own = await requireOwnStudent(db, user);
  if (!subjectsOf(own.record).includes(subject))
    throw new Error("You can only create lessons for your own subjects.");
  const profile = await loadProfile(db, user);
  if (!profile) throw new Error("Take the learning-style questionnaire first.");

  let unitRow = null;
  if (unit) {
    const u = await db.query(
      "SELECT title, topics FROM lms_units WHERE subject = $1 AND unit = $2",
      [subject, unit],
    );
    unitRow = u.rows[0] ?? null;
  }
  const { lesson } = await generateLesson(callModel, {
    subject,
    unitTitle: unitRow?.title,
    unitTopics: unitRow?.topics,
    topic,
    focus,
    traits: profile.traits,
    options: { detailLevel, durationMin },
  });
  const { rows } = await db.query(
    `INSERT INTO ai_lessons(owner_id, subject, unit, topic, focus, traits, content)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [
      user.id,
      subject,
      unit ?? null,
      topic,
      focus ?? "",
      JSON.stringify(profile.traits),
      JSON.stringify(lesson),
    ],
  );
  return getLesson(db, user, { id: rows[0].id });
}

export async function recordQuiz(db, user, { id, score, total }) {
  if (score > total) throw new Error("Score cannot exceed the number of questions.");
  const { rows } = await db.query(
    `UPDATE ai_lessons
        SET quiz_best = GREATEST(COALESCE(quiz_best, 0), $3), quiz_total = $4
      WHERE id = $1 AND owner_id = $2 AND $4 = jsonb_array_length(content->'quiz')
      RETURNING id`,
    [id, user.id, score, total],
  );
  if (!rows[0]) throw new Error("That lesson was not found.");
  return { saved: true };
}

export async function deleteLesson(db, user, { id }) {
  const { rowCount } = await db.query("DELETE FROM ai_lessons WHERE id = $1 AND owner_id = $2", [
    id,
    user.id,
  ]);
  if (!rowCount) throw new Error("That lesson was not found.");
  return { deleted: true };
}
