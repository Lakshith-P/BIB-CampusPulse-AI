// Role changes that keep an account consistent: a teacher or administrator is not also a student.
// Plain relative imports only, so these can be used from server functions and from tests alike.

// The empty record the system creates for a new student account: no teacher, no CGPA, no
// subjects, no LMS work and no support actions. Anything that holds real data is never matched.
const BLANK_RECORD = `
  sr.faculty_id IS NULL
  AND COALESCE(NULLIF(sr.record->>'cgpa', '')::numeric, 0) = 0
  AND jsonb_array_length(COALESCE(sr.record->'subjects', '[]'::jsonb)) = 0
  AND jsonb_array_length(COALESCE(sr.record->'lms', '[]'::jsonb)) = 0
  AND NOT EXISTS (SELECT 1 FROM campus_interventions i WHERE i.student_id = sr.id)`;

/** Removes the empty student record that was auto-created for this account, if that is all it has. */
export async function removeBlankStudentRecord(db, userId) {
  const { rowCount } = await db.query(
    `DELETE FROM student_records sr WHERE sr.owner_id = $1 AND ${BLANK_RECORD}`,
    [userId],
  );
  return rowCount;
}

/**
 * Gives an account a role. Becoming a teacher or administrator replaces the student role: the account stops being
 * a student, and the empty student record made for it goes too. A student record that holds real
 * data is kept (so nothing is lost), it just no longer belongs to a signed-in student.
 */
export async function grantAccountRole(db, userId, role) {
  await db.query("INSERT INTO user_roles(user_id, role) VALUES($1,$2) ON CONFLICT DO NOTHING", [
    userId,
    role,
  ]);
  if (role === "faculty" || role === "admin") {
    await db.query("DELETE FROM user_roles WHERE user_id = $1 AND role = 'student'", [userId]);
    await removeBlankStudentRecord(db, userId);
  }
}

/** Takes a role away. An account left with no role at all becomes a student again, so it still works. */
export async function revokeAccountRole(db, userId, role) {
  await db.query("DELETE FROM user_roles WHERE user_id = $1 AND role = $2", [userId, role]);
  const { rowCount } = await db.query("SELECT 1 FROM user_roles WHERE user_id = $1", [userId]);
  if (!rowCount)
    await db.query("INSERT INTO user_roles(user_id, role) VALUES($1,'student')", [userId]);
}
