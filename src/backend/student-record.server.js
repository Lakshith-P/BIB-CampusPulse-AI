import { studentSchema } from "@/lib/student-validation";
import { emptyStudent } from "@/lib/student-defaults";

// Gives a student account its record so it shows up in the administrator's lists straight away.
// A teacher is attached later; until then only administrators and the student see it.
export async function ensureStudentRecord(db, user, facultyId = null) {
  const recordId = `ACC-${user.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const student = studentSchema.parse({
    ...emptyStudent,
    id: recordId,
    name: user.display_name?.trim() || user.email.split("@")[0],
  });
  const inserted = await db.query(
    "INSERT INTO student_records(id, owner_id, faculty_id, record) VALUES($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING RETURNING id",
    [recordId, user.id, facultyId, JSON.stringify(student)],
  );
  return inserted.rowCount > 0;
}

// Records for plain student accounts that signed up before records were created at sign-up.
export async function backfillStudentRecords(db) {
  const missing = await db.query(
    `SELECT u.id, u.email, u.display_name FROM users u
      WHERE NOT EXISTS (SELECT 1 FROM student_records s WHERE s.owner_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role IN ('faculty','admin'))`,
  );
  for (const u of missing.rows) await ensureStudentRecord(db, u);
}
