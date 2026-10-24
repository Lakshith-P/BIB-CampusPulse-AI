// Adds synthetic inputs for the placement and result predictions to the SYN- demo students:
// mid exams, continuous assessments, teacher ratings and LeetCode progress.
// Usage: npm run db:seed-predictions        (add, replacing any earlier run)
//        npm run db:seed-predictions -- --remove
// Values follow each student's existing marks, attendance and skills plus noise, so the
// predictions are informative without simply echoing the stored marks. All of it is synthetic.
import pg from "pg";

import { poolConfig } from "../src/backend/db-config.js";

// A small seeded generator, so every run produces the same data.
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
const hash = (text) => [...text].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const noise = (rand, spread) => (rand() + rand() + rand() - 1.5) * spread;
const round1 = (n) => Math.round(n * 2) / 2;
const dateOffset = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

const client = new pg.Client(poolConfig());
await client.connect();
try {
  const remove = process.argv.includes("--remove");
  await client.query("BEGIN");
  await client.query(
    "DELETE FROM exam_scores WHERE student_id LIKE 'SYN-%' AND recorded_by IS NULL",
  );
  await client.query(
    "DELETE FROM teacher_ratings WHERE student_id LIKE 'SYN-%' AND rated_by IS NULL",
  );
  await client.query("DELETE FROM coding_profiles WHERE student_id LIKE 'SYN-%'");
  if (remove) {
    await client.query("COMMIT");
    console.log("Removed the synthetic prediction inputs.");
  } else {
    const { rows } = await client.query(
      `SELECT id,
              record->'subjects' AS subjects,
              (record->'skills'->>'coding')::int AS coding,
              (record->'skills'->>'aptitude')::int AS aptitude,
              (record->>'cgpa')::numeric AS cgpa
         FROM student_records WHERE id LIKE 'SYN-%' ORDER BY id`,
    );
    const exams = [];
    const ratings = [];
    const coding = [];
    for (const row of rows) {
      const rand = rng(hash(row.id));
      const subjects = row.subjects ?? [];
      const marked = subjects.filter((s) => typeof s.marks === "number");
      const marks = marked.length ? marked.reduce((a, s) => a + s.marks, 0) / marked.length : 60;
      const held = subjects.reduce((a, s) => a + (s.classesHeld ?? 0), 0);
      const att = held
        ? (subjects.reduce((a, s) => a + (s.classesAttended ?? 0), 0) / held) * 100
        : 80;
      const grit = noise(rand, 14); // how much better or worse this student does than their marks suggest

      for (const subject of subjects) {
        if (typeof subject.marks !== "number") continue;
        const base = clamp(subject.marks + grit * 0.5 + noise(rand, 10), 5, 98);
        const trend = noise(rand, 8);
        for (const [kind, shift, days] of [
          ["mid1", -trend / 2, 70],
          ["mid2", trend / 2, 25],
        ])
          exams.push({
            student_id: row.id,
            subject: subject.subject,
            kind,
            title: "",
            score: round1(clamp(((base + shift + noise(rand, 6)) / 100) * 50, 1, 50)),
            max_score: 50,
            taken_on: dateOffset(days),
          });
        for (const [title, days] of [
          ["Quiz 1", 55],
          ["Lab test", 30],
        ])
          exams.push({
            student_id: row.id,
            subject: subject.subject,
            kind: "continuous",
            title,
            score: round1(clamp(((base + noise(rand, 14)) / 100) * 10, 0, 10)),
            max_score: 10,
            taken_on: dateOffset(days),
          });
      }
      if (marked.length) {
        const rating = clamp(
          Math.round(1 + ((marks * 0.6 + att * 0.4 - 40) / 55) * 4 + noise(rand, 1.4)),
          1,
          5,
        );
        ratings.push({ student_id: row.id, subject: "", rating, comment: "" });
      }
      const skill = typeof row.coding === "number" && row.coding >= 0 ? row.coding : 40;
      const effort = clamp(
        (skill + noise(rand, 28) + Number(row.cgpa ?? 6) * 2 - 12) / 100,
        0.02,
        1,
      );
      const easy = Math.round(effort * 160 * rand() + effort * 20);
      coding.push({
        student_id: row.id,
        leetcode_username: row.id.toLowerCase().replace(/[^a-z0-9]/g, ""),
        easy,
        medium: Math.round(easy * (0.15 + effort * 0.7) * (0.5 + rand())),
        hard: Math.round(easy * effort * 0.15 * rand()),
        contest_rating: effort > 0.55 ? Math.round(1300 + effort * 700 + noise(rand, 150)) : null,
      });
    }

    const chunks = (list, size) =>
      Array.from({ length: Math.ceil(list.length / size) }, (_, i) =>
        list.slice(i * size, (i + 1) * size),
      );
    for (const part of chunks(exams, 600))
      await client.query(
        `INSERT INTO exam_scores (student_id, subject, kind, title, score, max_score, taken_on)
         SELECT student_id, subject, kind, title, score, max_score, taken_on::date
           FROM jsonb_to_recordset($1::jsonb)
             AS t(student_id text, subject text, kind text, title text, score numeric, max_score numeric, taken_on text)`,
        [JSON.stringify(part)],
      );
    await client.query(
      `INSERT INTO teacher_ratings (student_id, subject, rating, comment)
       SELECT student_id, subject, rating, comment
         FROM jsonb_to_recordset($1::jsonb) AS t(student_id text, subject text, rating int, comment text)`,
      [JSON.stringify(ratings)],
    );
    await client.query(
      `INSERT INTO coding_profiles (student_id, leetcode_username, easy, medium, hard, contest_rating)
       SELECT student_id, leetcode_username, easy, medium, hard, contest_rating
         FROM jsonb_to_recordset($1::jsonb)
           AS t(student_id text, leetcode_username text, easy int, medium int, hard int, contest_rating int)`,
      [JSON.stringify(coding)],
    );
    await client.query("COMMIT");
    console.log(
      `Added ${exams.length} exam scores, ${ratings.length} ratings and ${coding.length} LeetCode profiles for ${rows.length} students.`,
    );
  }
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
