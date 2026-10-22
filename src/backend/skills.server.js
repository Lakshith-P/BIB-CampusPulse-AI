import { ownStudent, staffStudent, visibleStudent, isStaff } from "./access.server.js";

export const SKILL_CATEGORIES = ["coding", "aptitude", "analytical", "verbal", "communication"];

/** record.skills[category] follows the average of the three most recent assessments. */
async function refreshSkill(db, studentId, category) {
  const { rows } = await db.query(
    `SELECT score FROM skill_assessments WHERE student_id = $1 AND category = $2
      ORDER BY taken_on DESC, created_at DESC LIMIT 3`,
    [studentId, category],
  );
  if (!rows.length) return;
  const mean = Math.round(rows.reduce((a, r) => a + Number(r.score), 0) / rows.length);
  await db.query(
    `UPDATE student_records
        SET record = jsonb_set(record, ARRAY['skills', $2::text], to_jsonb($3::int)), updated_at = now()
      WHERE id = $1`,
    [studentId, category, mean],
  );
}

export async function recordAssessment(db, user, data) {
  await staffStudent(db, user, data.studentId);
  await db.query(
    `INSERT INTO skill_assessments(student_id, category, topic, score, taken_on, recorded_by)
     VALUES($1,$2,$3,$4,$5::date,$6)`,
    [data.studentId, data.category, data.topic, data.score, data.takenOn, user.id],
  );
  await refreshSkill(db, data.studentId, data.category);
  return { saved: true };
}

export async function deleteAssessment(db, user, { id }) {
  const { rows } = await db.query(
    "SELECT student_id, category FROM skill_assessments WHERE id = $1",
    [id],
  );
  if (!rows[0]) throw new Error("That assessment no longer exists.");
  await staffStudent(db, user, rows[0].student_id);
  await db.query("DELETE FROM skill_assessments WHERE id = $1", [id]);
  await refreshSkill(db, rows[0].student_id, rows[0].category);
  return { saved: true };
}

/** A student's assessment history (their own, or any student a teacher may see). */
export async function listAssessments(db, user, { studentId } = {}) {
  let target = studentId;
  if (!target || !isStaff(user)) {
    const own = await ownStudent(db, user);
    if (!own) return [];
    target = own.id;
  } else if (!(await visibleStudent(db, user, target))) {
    throw new Error("You cannot see this student.");
  }
  const { rows } = await db.query(
    `SELECT id, category, topic, score, taken_on::text AS taken_on
       FROM skill_assessments WHERE student_id = $1 ORDER BY taken_on, created_at`,
    [target],
  );
  return rows.map((r) => ({ ...r, score: Number(r.score) }));
}
