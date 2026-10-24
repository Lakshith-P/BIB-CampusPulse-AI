import {
  adminIds,
  isAdmin,
  notify,
  ownStudent,
  requireAdminUser,
  requireOwnStudent,
  requireStaff,
  subjectsOf,
} from "./access.server.js";
import { appendChainBlock, sha256 } from "./chain.server.js";
import { subjectsFor } from "./lms.server.js";

export const COMPLAINT_CATEGORIES = ["academic", "faculty", "facilities", "harassment", "other"];

// ------------------------------------------------------------------ confidential complaints
// Content is only ever returned to the person who wrote it and to administrators. Notifications
// about complaints never contain what was written.
export async function submitComplaint(db, user, { category, subject, body }) {
  const { rows } = await db.query(
    "INSERT INTO complaints(user_id, category, subject, body) VALUES($1,$2,$3,$4) RETURNING id",
    [user.id, category, subject, body],
  );
  const id = rows[0].id;
  await appendChainBlock(db, {
    complaintId: id,
    eventType: "CREATED",
    actorId: user.id,
    payload: { category, subject, bodyHash: sha256(body), status: "new" },
  });
  for (const adminId of await adminIds(db))
    await notify(db, adminId, {
      area: "Complaint",
      priority: "high",
      title: "A confidential complaint is waiting for review",
      link: "/portal/complaints",
      key: `complaint:${id}`,
    });
  return { saved: true, id };
}

const shape = (r) => ({
  ...r,
  created_at: new Date(r.created_at).toISOString(),
  responded_at: r.responded_at ? new Date(r.responded_at).toISOString() : null,
});

export async function listMyComplaints(db, user) {
  const { rows } = await db.query(
    `SELECT id, category, subject, body, status, response, responded_at, created_at
       FROM complaints WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [user.id],
  );
  return rows.map(shape);
}

export async function listAllComplaints(db, user) {
  requireAdminUser(user);
  const { rows } = await db.query(
    `SELECT c.id, c.category, c.subject, c.body, c.status, c.response, c.responded_at, c.created_at,
            c.severity, c.assigned_to, a.display_name AS assignee_name, a.email AS assignee_email,
            u.email AS author_email, u.display_name AS author_name
       FROM complaints c JOIN users u ON u.id = c.user_id
       LEFT JOIN users a ON a.id = c.assigned_to
      ORDER BY (c.status = 'resolved'), c.created_at DESC LIMIT 300`,
  );
  return rows.map(shape);
}

export async function assignComplaintToMe(db, user, { id }) {
  requireAdminUser(user);
  const { rows } = await db.query(
    "UPDATE complaints SET assigned_to = $2 WHERE id = $1 RETURNING assigned_to",
    [id, user.id],
  );
  if (!rows[0]) throw new Error("That complaint no longer exists.");
  await appendChainBlock(db, {
    complaintId: id,
    eventType: "ASSIGNED",
    actorId: user.id,
    payload: { assignedTo: user.id },
  });
  return { saved: true };
}

export async function respondToComplaint(db, user, { id, status, response, severity }) {
  requireAdminUser(user);
  const before = await db.query("SELECT user_id, status, severity FROM complaints WHERE id = $1", [
    id,
  ]);
  if (!before.rows[0]) throw new Error("That complaint no longer exists.");
  const prior = before.rows[0];
  severity ??= prior.severity;
  const { rows } = await db.query(
    `UPDATE complaints SET status = $2, response = $3, reviewed_by = $4, severity = $5,
            responded_at = CASE WHEN $3 <> '' THEN now() ELSE responded_at END
      WHERE id = $1 RETURNING user_id`,
    [id, status, response, user.id, severity],
  );
  if (!rows[0]) throw new Error("That complaint no longer exists.");
  await db.query(
    "INSERT INTO campus_audit(actor_id, record_id, operation) VALUES($1,$2,'COMPLAINT')",
    [user.id, id],
  );
  if (severity !== prior.severity)
    await appendChainBlock(db, {
      complaintId: id,
      eventType: "SEVERITY_OVERRIDE",
      actorId: user.id,
      payload: { from: prior.severity, to: severity },
    });
  if (status !== prior.status)
    await appendChainBlock(db, {
      complaintId: id,
      eventType:
        prior.status === "resolved" && status !== "resolved" ? "REOPENED" : "STATUS_CHANGED",
      actorId: user.id,
      payload: { from: prior.status, to: status },
    });
  if (status === "resolved" && response)
    await appendChainBlock(db, {
      complaintId: id,
      eventType: "RESOLUTION_EVIDENCE",
      actorId: user.id,
      payload: { status, responseHash: sha256(response) },
    });
  await notify(db, rows[0].user_id, {
    area: "Complaint",
    priority: "medium",
    title: "Your complaint has an update",
    body: status === "resolved" ? "It has been marked resolved." : "It is being reviewed.",
    link: "/portal/feedback",
    key: `complaint-update:${id}:${status}:${response.length}`,
  });
  return { saved: true };
}

// ------------------------------------------------------------------ satisfaction ratings
const average = (r) => (r.teaching + r.content + r.support + r.facilities) / 4;

/** Keeps record.satisfaction (shown to teachers) equal to the mean of the latest five ratings. */
async function refreshSatisfaction(db, studentId) {
  const { rows } = await db.query(
    `SELECT teaching, content, support, facilities FROM satisfaction_ratings
      WHERE student_id = $1 ORDER BY created_at DESC LIMIT 5`,
    [studentId],
  );
  if (!rows.length) return;
  const mean = Math.round((rows.reduce((a, r) => a + average(r), 0) / rows.length) * 10) / 10;
  await db.query(
    "UPDATE student_records SET record = jsonb_set(record, '{satisfaction}', to_jsonb($2::numeric)), updated_at = now() WHERE id = $1",
    [studentId, mean],
  );
}

export async function submitRating(db, user, data) {
  const own = await requireOwnStudent(db, user);
  const recent = await db.query(
    "SELECT 1 FROM satisfaction_ratings WHERE student_id = $1 AND created_at > now() - interval '7 days'",
    [own.id],
  );
  if (recent.rowCount)
    throw new Error("You already shared your ratings this week. Try again next week.");
  await db.query(
    `INSERT INTO satisfaction_ratings(student_id, teaching, content, support, facilities, comment)
     VALUES($1,$2,$3,$4,$5,$6)`,
    [own.id, data.teaching, data.content, data.support, data.facilities, data.comment],
  );
  await refreshSatisfaction(db, own.id);
  return { saved: true };
}

export async function listMyRatings(db, user) {
  const own = await requireOwnStudent(db, user);
  const { rows } = await db.query(
    `SELECT id, teaching, content, support, facilities, comment, created_at
       FROM satisfaction_ratings WHERE student_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [own.id],
  );
  return rows.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() }));
}

// ------------------------------------------------------------------ teacher review per subject
// A student reviews the teaching of each subject they take. Staff read the averages per subject,
// never who wrote what, and a student can revise their own review at any time.
export const REVIEW_DIMENSIONS = ["teaching", "clarity", "support", "pace"];

const reviewAverage = (r) =>
  REVIEW_DIMENSIONS.reduce((a, k) => a + Number(r[k]), 0) / REVIEW_DIMENSIONS.length;

export async function submitSubjectReview(db, user, data) {
  const own = await requireOwnStudent(db, user);
  if (!subjectsOf(own.record).includes(data.subject))
    throw new Error("That subject is not one of yours.");
  await db.query(
    `INSERT INTO subject_reviews(student_id, subject, teaching, clarity, support, pace, comment)
     VALUES($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (student_id, subject) DO UPDATE SET
       teaching = EXCLUDED.teaching, clarity = EXCLUDED.clarity, support = EXCLUDED.support,
       pace = EXCLUDED.pace, comment = EXCLUDED.comment, updated_at = now()`,
    [own.id, data.subject, data.teaching, data.clarity, data.support, data.pace, data.comment],
  );
  return { saved: true };
}

/** The student's own reviews, plus the subjects on their record so the page can list them all. */
export async function listMySubjectReviews(db, user) {
  const own = await ownStudent(db, user);
  if (!own) return { subjects: [], reviews: [] };
  const { rows } = await db.query(
    `SELECT subject, teaching, clarity, support, pace, comment, updated_at
       FROM subject_reviews WHERE student_id = $1 ORDER BY subject`,
    [own.id],
  );
  return {
    subjects: subjectsOf(own.record),
    reviews: rows.map((r) => ({
      ...r,
      average: Math.round(reviewAverage(r) * 10) / 10,
      updated_at: new Date(r.updated_at).toISOString(),
    })),
  };
}

/** Averages per subject for teachers and administrators. Comments stay with the students. */
export async function subjectReviewSummary(db, user) {
  requireStaff(user);
  const subjects = await subjectsFor(db, user);
  if (!subjects.length) return [];
  const { rows } = await db.query(
    `SELECT subject, count(*)::int AS reviews,
            avg(teaching)::numeric(4,2) AS teaching, avg(clarity)::numeric(4,2) AS clarity,
            avg(support)::numeric(4,2) AS support, avg(pace)::numeric(4,2) AS pace
       FROM subject_reviews WHERE subject = ANY($1) GROUP BY subject ORDER BY subject`,
    [subjects],
  );
  const bySubject = new Map(
    rows.map((r) => [
      r.subject,
      {
        reviews: r.reviews,
        teaching: Number(r.teaching),
        clarity: Number(r.clarity),
        support: Number(r.support),
        pace: Number(r.pace),
      },
    ]),
  );
  return subjects.map((subject) => {
    const row = bySubject.get(subject);
    return {
      subject,
      reviews: row?.reviews ?? 0,
      teaching: row?.teaching ?? null,
      clarity: row?.clarity ?? null,
      support: row?.support ?? null,
      pace: row?.pace ?? null,
      average: row ? Math.round(reviewAverage(row) * 10) / 10 : null,
    };
  });
}

export const isComplaintReviewer = isAdmin;
