// Shared permission helpers for the server modules. Every function takes a database handle
// ({ query }) so the same SQL runs against the pool, a transaction, or a test database.

export const isAdmin = (user) => user.roles.includes("admin");
export const isFaculty = (user) => user.roles.includes("faculty");
export const isStaff = (user) => isAdmin(user) || isFaculty(user);

export function requireStaff(user) {
  if (!isStaff(user)) throw new Error("Only teachers and administrators can do this.");
}
export function requireAdminUser(user) {
  if (!isAdmin(user)) throw new Error("Only administrators can do this.");
}

/** A student record the caller may read: their own, one assigned to them, or any as admin. */
export async function visibleStudent(db, user, studentId) {
  const { rows } = await db.query(
    `SELECT sr.id, sr.owner_id, sr.faculty_id, sr.record
       FROM student_records sr
      WHERE sr.id = $4 AND (sr.owner_id = $1 OR ($2::boolean AND sr.faculty_id = $1) OR $3::boolean)`,
    [user.id, isFaculty(user), isAdmin(user), studentId],
  );
  return rows[0] ?? null;
}

/** A student record a teacher or administrator may change (not merely the student's own). */
export async function staffStudent(db, user, studentId) {
  requireStaff(user);
  const { rows } = await db.query(
    `SELECT sr.id, sr.owner_id, sr.faculty_id, sr.record
       FROM student_records sr
      WHERE sr.id = $3 AND ($2::boolean OR ($1 = sr.faculty_id))`,
    [user.id, isAdmin(user), studentId],
  );
  if (!rows[0]) throw new Error("That student is not assigned to you.");
  return rows[0];
}

/** The caller's own student record, or null when none is linked to their account. */
export async function ownStudent(db, user) {
  const { rows } = await db.query(
    "SELECT id, owner_id, faculty_id, record FROM student_records WHERE owner_id = $1 ORDER BY id LIMIT 1",
    [user.id],
  );
  return rows[0] ?? null;
}

export async function requireOwnStudent(db, user) {
  const own = await ownStudent(db, user);
  if (!own) throw new Error("No student record is linked to your account yet.");
  return own;
}

/** Subjects a student takes, from their record. */
export const subjectsOf = (record) => (record?.subjects ?? []).map((s) => s.subject);

/** Teachers manage subjects of students assigned to them; administrators manage any subject. */
export async function canManageSubject(db, user, subject) {
  if (isAdmin(user)) return true;
  if (!isFaculty(user)) return false;
  const { rowCount } = await db.query(
    `SELECT 1 FROM student_records
      WHERE faculty_id = $1 AND record->'subjects' @> jsonb_build_array(jsonb_build_object('subject', $2::text))
      LIMIT 1`,
    [user.id, subject],
  );
  return rowCount > 0;
}

export async function requireSubjectManager(db, user, subject) {
  requireStaff(user);
  if (!(await canManageSubject(db, user, subject)))
    throw new Error("You can only manage subjects taken by students assigned to you.");
}

/** Stores a notification once; the same key for the same person is ignored. */
export async function notify(db, userId, n) {
  if (!userId) return;
  await db.query(
    `INSERT INTO notifications(user_id, area, priority, title, body, link, dedupe_key)
     VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
    [userId, n.area, n.priority ?? "medium", n.title, n.body ?? "", n.link ?? "/portal", n.key],
  );
}

export async function adminIds(db) {
  const { rows } = await db.query("SELECT user_id FROM user_roles WHERE role = 'admin'");
  return rows.map((r) => r.user_id);
}
