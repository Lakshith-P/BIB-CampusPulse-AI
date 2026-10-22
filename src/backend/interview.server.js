import { decodeFile, encodeFile } from "./files.server.js";
import { requireOwnStudent } from "./access.server.js";
import { modelCaller } from "./ai-lessons.server.js";
import {
  DIFFICULTIES,
  TYPE_KEYS,
  buildEvaluationPrompt,
  buildQuestionsPrompt,
  parseEvaluation,
  parseQuestions,
} from "@/lib/interview-prompt";

// AI mock interviews. The questions (and what a strong answer covers) are written server-side
// from the student's resume; the hidden answers stay in the database until grading. Code is
// reviewed by the model, never executed.

const RESUME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);
const MAX_TEXT = 12000;

const clean = (text) =>
  text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT);

/** Pulls the text out of a PDF, Word or plain-text resume. */
export async function extractResumeText(type, buffer) {
  if (type === "text/plain") return clean(buffer.toString("utf8"));
  if (type === "application/pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return clean(text);
  }
  const mammoth = await import("mammoth");
  return clean((await mammoth.extractRawText({ buffer })).value);
}

// ------------------------------------------------------------------ resume
export async function loadResume(db, user) {
  const { rows } = await db.query(
    "SELECT file_name, resume_text, updated_at FROM resumes WHERE user_id = $1",
    [user.id],
  );
  const r = rows[0];
  return r
    ? {
        fileName: r.file_name,
        text: r.resume_text,
        updatedAt: new Date(r.updated_at).toISOString(),
      }
    : null;
}

/**
 * Stores a resume file (and reads its text), or just replaces the text the questions are built
 * from. The student can correct what was read, so a badly scanned PDF is never a dead end.
 */
export async function saveResume(db, user, { file, text }) {
  await requireOwnStudent(db, user);
  if (file) {
    if (!RESUME_TYPES.has(file.type))
      throw new Error("Upload your resume as a PDF, Word (.docx) or TXT file.");
    const f = decodeFile(file);
    let extracted = "";
    try {
      extracted = await extractResumeText(f.type, f.buffer);
    } catch {
      // Falls through to the pasted text below, or the clear error.
    }
    const body = text?.trim() ? clean(text) : extracted;
    if (body.length < 50)
      throw new Error(
        "We could not read text from that file (it may be a scanned image). Paste your resume text as well.",
      );
    await db.query(
      `INSERT INTO resumes(user_id, file_name, file_type, file_data, resume_text)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT (user_id) DO UPDATE
         SET file_name = $2, file_type = $3, file_data = $4, resume_text = $5, updated_at = now()`,
      [user.id, f.name, f.type, f.buffer, body],
    );
  } else {
    const body = clean(text ?? "");
    if (body.length < 50) throw new Error("Add at least a few lines of your resume.");
    await db.query(
      `INSERT INTO resumes(user_id, resume_text) VALUES($1,$2)
       ON CONFLICT (user_id) DO UPDATE SET resume_text = $2, updated_at = now()`,
      [user.id, body],
    );
  }
  return loadResume(db, user);
}

export async function removeResume(db, user) {
  await db.query("DELETE FROM resumes WHERE user_id = $1", [user.id]);
  return { deleted: true };
}

export async function downloadResume(db, user) {
  const { rows } = await db.query(
    "SELECT file_name, file_type, file_data FROM resumes WHERE user_id = $1",
    [user.id],
  );
  if (!rows[0]?.file_data) throw new Error("You have not uploaded a resume file.");
  return encodeFile(rows[0].file_name, rows[0].file_type, rows[0].file_data);
}

// ------------------------------------------------------------------ interviews
const publicQuestions = (qs) => qs.map(({ expected: _expected, ...q }, index) => ({ ...q, index }));

/** Runs a model call and parses it; one repair attempt, as with lessons. */
async function ask(callModel, prompt, parse) {
  const first = await callModel(prompt);
  try {
    return parse(first);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const second = await callModel(
      `${prompt}\n\nYour previous response failed validation:\n${reason.slice(0, 1000)}\nReturn ONLY the corrected JSON object.`,
    );
    try {
      return parse(second);
    } catch {
      throw new Error("The interviewer returned an unusable response. Please try again.");
    }
  }
}

export async function startInterview(
  db,
  user,
  { role, difficulty, types, count },
  callModel = modelCaller(),
) {
  const own = await requireOwnStudent(db, user);
  if (!DIFFICULTIES.includes(difficulty)) throw new Error("Choose a difficulty.");
  const chosen = [...new Set(types)].filter((t) => TYPE_KEYS.includes(t));
  if (!chosen.length) throw new Error("Choose at least one type of question.");
  let resumeText = "";
  if (chosen.includes("resume")) {
    resumeText = (await loadResume(db, user))?.text ?? "";
    if (!resumeText) throw new Error("Upload your resume first to get resume-based questions.");
  }
  const { questions } = await ask(
    callModel,
    buildQuestionsPrompt({ role, difficulty, types: chosen, count, resumeText }),
    parseQuestions,
  );
  const { rows } = await db.query(
    `INSERT INTO interview_sessions(owner_id, student_id, role, difficulty, types, questions)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
    [user.id, own.id, role, difficulty, chosen, JSON.stringify(questions)],
  );
  return { id: rows[0].id, role, difficulty, questions: publicQuestions(questions) };
}

const average = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export async function submitInterview(db, user, { id, answers }, callModel = modelCaller()) {
  const { rows } = await db.query(
    "SELECT * FROM interview_sessions WHERE id = $1 AND owner_id = $2",
    [id, user.id],
  );
  const session = rows[0];
  if (!session) throw new Error("That interview was not found.");
  if (session.status === "completed") throw new Error("This interview has already been graded.");
  const byIndex = new Map(answers.map((a) => [a.index, a]));
  const items = session.questions.map((q, index) => {
    const a = byIndex.get(index);
    return {
      index,
      type: q.type,
      question: q.question,
      expected: q.expected,
      language: a?.language || q.language || "",
      answer: (a?.answer ?? "").trim(),
      code: (a?.code ?? "").trim(),
    };
  });
  const answered = items.filter((it) => it.answer || it.code);
  const graded = answered.length
    ? await ask(
        callModel,
        buildEvaluationPrompt({
          role: session.role,
          difficulty: session.difficulty,
          items: answered,
        }),
        parseEvaluation,
      )
    : { results: [], summary: "No questions were answered.", strengths: [], improvements: [] };

  const scoreOf = new Map(graded.results.map((r) => [r.index, r]));
  const perQuestion = items.map((it) => {
    const r = scoreOf.get(it.index);
    const blank = !it.answer && !it.code;
    return {
      index: it.index,
      type: it.type,
      question: it.question,
      answer: it.answer,
      code: it.code,
      language: it.language,
      score: blank ? 0 : (r?.score ?? 0),
      feedback: blank ? "You did not answer this question." : (r?.feedback ?? "Not graded."),
      better: blank ? "" : (r?.better ?? ""),
    };
  });
  // The overall mark is computed here from the question marks, never taken from the model.
  const overall = Math.round(average(perQuestion.map((q) => q.score)) * 10);
  const byType = {};
  for (const q of perQuestion) (byType[q.type] ??= []).push(q.score);
  const result = {
    overall,
    summary: graded.summary,
    strengths: graded.strengths,
    improvements: graded.improvements,
    byType: Object.fromEntries(
      Object.entries(byType).map(([t, s]) => [t, Math.round(average(s) * 10)]),
    ),
    questions: perQuestion,
  };
  await db.query(
    `UPDATE interview_sessions
        SET answers = $2, result = $3, status = 'completed', completed_at = now()
      WHERE id = $1`,
    [id, JSON.stringify(answers), JSON.stringify(result)],
  );
  // Counts as a mock interview on the student's record and in the placement readiness data.
  await db.query(
    `INSERT INTO mock_interviews(student_id, interviewer, score, feedback, recorded_by)
     VALUES($1,'AI mock interviewer',$2,$3,$4)`,
    [session.student_id, overall, graded.summary.slice(0, 1000), user.id],
  );
  await db.query(
    `UPDATE student_records
        SET record = jsonb_set(record, '{mockInterviews}',
              to_jsonb((SELECT count(*)::int FROM mock_interviews WHERE student_id = $1))),
            updated_at = now()
      WHERE id = $1`,
    [session.student_id],
  );
  return { id, role: session.role, ...result };
}

export async function listInterviews(db, user) {
  const { rows } = await db.query(
    `SELECT id, role, difficulty, status, result->'overall' AS overall, created_at
       FROM interview_sessions WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [user.id],
  );
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    difficulty: r.difficulty,
    status: r.status,
    overall: r.overall === null ? null : Number(r.overall),
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

export async function getInterviewResult(db, user, { id }) {
  const { rows } = await db.query(
    "SELECT role, status, result FROM interview_sessions WHERE id = $1 AND owner_id = $2",
    [id, user.id],
  );
  if (!rows[0] || rows[0].status !== "completed") throw new Error("That result was not found.");
  return { id, role: rows[0].role, ...rows[0].result };
}

export async function deleteInterview(db, user, { id }) {
  const { rowCount } = await db.query(
    "DELETE FROM interview_sessions WHERE id = $1 AND owner_id = $2",
    [id, user.id],
  );
  if (!rowCount) throw new Error("That interview was not found.");
  return { deleted: true };
}
