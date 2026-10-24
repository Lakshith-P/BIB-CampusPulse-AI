import { studentSchema } from "@/lib/student-validation";
import { emptyStudent } from "@/lib/student-defaults";
import { ownStudent } from "./access.server.js";
import { componentScores, successScore } from "@/lib/scoring";

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

// Aggregates over fewer peers than this could reveal one classmate's numbers, so they are withheld.
export const MIN_COHORT = 5;
export const COMPETENCIES = [
  ["academics", "Academic performance"],
  ["attendance", "Attendance regularity"],
  ["lms", "LMS & coursework"],
  ["skills", "Skills assessments"],
  ["engagement", "Engagement & activities"],
  ["placement", "Placement readiness"],
];

const median = (values) => {
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};
const quantile = (values, q) => {
  const v = [...values].sort((a, b) => a - b);
  const pos = (v.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
};
const share = (values, mine) =>
  Math.round((values.filter((x) => x <= mine).length / values.length) * 100);
const round1 = (n) => Math.round(n * 10) / 10;

/**
 * How the signed-in student compares with classmates in the same branch and semester: their
 * Success Score rank, a percentile for each score component, and the cohort's median and top-10%
 * SGPA for every semester. Only aggregates leave the server, never a peer's record, and nothing
 * is returned for a cohort smaller than MIN_COHORT.
 */
export async function cohortStanding(db, user) {
  const own = await ownStudent(db, user);
  if (!own) return null;
  const mine = studentSchema.safeParse(own.record);
  if (!mine.success) return null;
  const me = mine.data;

  const { rows } = await db.query(
    `SELECT record FROM student_records
      WHERE id <> $1 AND record->>'branch' = $2 AND (record->>'semester')::int = $3`,
    [own.id, me.branch, me.semester],
  );
  const peers = rows
    .map((r) => studentSchema.safeParse(r.record))
    .filter((p) => p.success)
    .map((p) => p.data);
  const base = { cohortSize: peers.length + 1, minCohort: MIN_COHORT, branch: me.branch };
  if (peers.length < MIN_COHORT)
    return { ...base, enough: false, rank: null, topPercent: null, competencies: [], sgpa: [] };

  const myScore = successScore(me).score;
  const peerScores = peers.map((p) => successScore(p).score).filter((v) => v !== null);
  const rank = myScore === null ? null : 1 + peerScores.filter((v) => v > myScore).length;
  const ranked = peerScores.length + 1;

  const myParts = componentScores(me);
  const peerParts = peers.map(componentScores);
  const competencies = COMPETENCIES.map(([key, label]) => {
    const values = peerParts.map((c) => c[key]).filter((v) => v !== null);
    const value = myParts[key];
    const enough = values.length >= MIN_COHORT;
    return {
      key,
      label,
      mine: value === null ? null : round1(value),
      median: enough ? round1(median(values)) : null,
      percentile: enough && value !== null ? share(values, value) : null,
    };
  });

  const sgpa = me.semesterGrades.map((grade, i) => {
    const values = peers.map((p) => p.semesterGrades[i]).filter((g) => g !== undefined && g > 0);
    const enough = values.length >= MIN_COHORT;
    return {
      semester: i + 1,
      mine: grade,
      median: enough ? round1(median(values)) : null,
      top10: enough ? round1(quantile(values, 0.9)) : null,
    };
  });

  return {
    ...base,
    enough: true,
    rank,
    rankedOutOf: ranked,
    topPercent: rank === null ? null : Math.max(1, Math.ceil((rank / ranked) * 100)),
    competencies,
    sgpa,
  };
}

// Records for student accounts that signed up before records were created at sign-up. An account
// without the student role (a teacher waiting for approval) is never given one.
export async function backfillStudentRecords(db) {
  const missing = await db.query(
    `SELECT u.id, u.email, u.display_name FROM users u
      WHERE NOT EXISTS (SELECT 1 FROM student_records s WHERE s.owner_id = u.id)
        AND EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role = 'student')
        AND NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role IN ('faculty','admin'))`,
  );
  for (const u of missing.rows) await ensureStudentRecord(db, u);
}
