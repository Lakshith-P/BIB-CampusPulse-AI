import { isAdmin, requireStaff, staffStudent, visibleStudent } from "./access.server.js";
import { DEFAULT_CREDITS, recalculatedGrades, semesterResult } from "@/lib/grades";

// Works out SGPA and CGPA from the marks already on a student's record, so the results a
// student sees are the ones their marks add up to. The marks themselves are never changed, and
// a student with no marks recorded is left untouched rather than given a made-up grade.

/** Credits per subject, from the published syllabus; subjects without one count as 4. */
async function creditLookup(db) {
  const { rows } = await db.query("SELECT subject, credits FROM lms_syllabus");
  const by = new Map(rows.map((r) => [r.subject, Number(r.credits) || DEFAULT_CREDITS]));
  return (subject) => by.get(subject) ?? DEFAULT_CREDITS;
}

/** How a student's current SGPA is arrived at, subject by subject. */
export async function gradeBreakdown(db, user, { studentId }) {
  const row = await visibleStudent(db, user, studentId);
  if (!row) throw new Error("That student record was not found.");
  const creditsOf = await creditLookup(db);
  const result = semesterResult(row.record.subjects, creditsOf);
  return {
    id: row.id,
    semester: row.record.semester ?? 1,
    cgpa: row.record.cgpa ?? 0,
    semesterGrades: row.record.semesterGrades ?? [],
    ...result,
  };
}

/**
 * Recalculates the results of one student, or of everyone the caller is responsible for
 * (a teacher's own students, every student for an administrator), and writes them back.
 * Each change is logged, and the returned rows say what moved and what was skipped.
 */
export async function recalculateGrades(db, user, { studentId = null } = {}) {
  requireStaff(user);
  const creditsOf = await creditLookup(db);
  let targets;
  if (studentId) {
    const row = await staffStudent(db, user, studentId);
    targets = [row];
  } else {
    const { rows } = await db.query(
      `SELECT id, record FROM student_records
        WHERE $2::boolean OR faculty_id = $1
        ORDER BY record->>'name', id
        FOR UPDATE`,
      [user.id, isAdmin(user)],
    );
    targets = rows;
  }

  const changed = [];
  const skipped = [];
  const writes = [];
  for (const row of targets) {
    const next = recalculatedGrades(row.record, creditsOf);
    if (!next) {
      skipped.push({ id: row.id, name: row.record.name ?? row.id, reason: "No marks recorded" });
      continue;
    }
    const before = { cgpa: row.record.cgpa ?? 0, grades: row.record.semesterGrades ?? [] };
    const same =
      Math.abs(before.cgpa - next.cgpa) < 0.005 &&
      before.grades.length === next.semesterGrades.length &&
      before.grades.every((g, i) => Math.abs(g - next.semesterGrades[i]) < 0.005);
    if (same) continue;
    writes.push({ id: row.id, cgpa: next.cgpa, grades: next.semesterGrades });
    changed.push({
      id: row.id,
      name: row.record.name ?? row.id,
      semester: row.record.semester ?? 1,
      sgpa: next.sgpa,
      cgpa: next.cgpa,
      wasCgpa: before.cgpa,
      subjects: next.rows.length,
      failed: next.failed,
    });
  }
  // One statement for every record that moved, so a whole class is updated in a single round
  // trip, and one audit row each because the change is a staff action on a live record.
  if (writes.length) {
    const payload = JSON.stringify(writes);
    await db.query(
      `UPDATE student_records sr
          SET record = jsonb_set(
                jsonb_set(sr.record, '{cgpa}', to_jsonb(v.cgpa), true),
                '{semesterGrades}', v.grades, true),
              updated_at = now()
         FROM jsonb_to_recordset($1::jsonb) AS v(id text, cgpa numeric, grades jsonb)
        WHERE sr.id = v.id`,
      [payload],
    );
    await db.query(
      `INSERT INTO campus_audit(actor_id, record_id, operation)
       SELECT $1, v.id, 'UPDATE' FROM jsonb_to_recordset($2::jsonb) AS v(id text)`,
      [user.id, payload],
    );
  }
  return { considered: targets.length, changed, skipped };
}
