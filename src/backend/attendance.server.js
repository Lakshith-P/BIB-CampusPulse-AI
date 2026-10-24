import {
  isAdmin,
  isFaculty,
  notify,
  ownStudent,
  requireAdminUser,
  requireStaff,
  requireSubjectManager,
  subjectsOf,
} from "./access.server.js";
import { subjectsFor } from "./lms.server.js";
import { PERIODS, planTimetable } from "@/lib/timetable-plan";

// Teachers mark attendance class by class; each save keeps the subject's held/attended totals
// on the student's record in step, so the Success Score and risk flags use the marked data.
// Re-marking a class replaces its earlier marks instead of counting it twice.

// Who may do what: the teacher of a subject (teacher_subjects) marks its attendance for every
// student taking it. Administrators assign subjects to teachers and can view any subject's
// attendance, but never mark it. Students see only their own log.

const ADMIN_CANNOT_MARK =
  "Administrators can view attendance but not mark it. The subject's teacher marks it.";

/** The subjects this account teaches. */
export async function taughtSubjects(db, userId) {
  const { rows } = await db.query(
    "SELECT subject FROM teacher_subjects WHERE teacher_id = $1 ORDER BY subject",
    [userId],
  );
  return rows.map((r) => r.subject);
}

const teaches = async (db, user, subject) =>
  isFaculty(user) &&
  (
    await db.query("SELECT 1 FROM teacher_subjects WHERE teacher_id = $1 AND subject = $2", [
      user.id,
      subject,
    ])
  ).rowCount > 0;

/** Viewing a subject's attendance: its teacher, or any administrator. */
async function requireAttendanceViewer(db, user, subject) {
  requireStaff(user);
  if (isAdmin(user) || (await teaches(db, user, subject))) return;
  throw new Error("You can only open attendance for the subjects you teach.");
}

/** Marking a subject's attendance: only the teacher who teaches it. */
async function requireAttendanceMarker(db, user, subject) {
  requireStaff(user);
  if (await teaches(db, user, subject)) return;
  throw new Error(
    isAdmin(user) ? ADMIN_CANNOT_MARK : "You can only mark attendance for the subjects you teach.",
  );
}

/**
 * The subjects the caller can open, and whether they can mark them. A teacher gets the subjects
 * they teach; an administrator gets every subject on record, to view.
 */
export async function attendanceSubjects(db, user) {
  requireStaff(user);
  const mine = isFaculty(user) ? await taughtSubjects(db, user.id) : [];
  if (!isAdmin(user)) return { subjects: mine, taught: mine };
  const { rows } = await db.query(
    `SELECT DISTINCT s->>'subject' AS subject
       FROM student_records sr, jsonb_array_elements(sr.record->'subjects') s
      WHERE s->>'subject' IS NOT NULL
      ORDER BY 1`,
  );
  return { subjects: rows.map((r) => r.subject), taught: mine };
}

/** Every student taking the subject. */
async function roster(db, subject) {
  const { rows } = await db.query(
    `SELECT sr.id, sr.owner_id, sr.record->>'name' AS name
       FROM student_records sr
      WHERE sr.record->'subjects' @> jsonb_build_array(jsonb_build_object('subject', $1::text))
      ORDER BY sr.record->>'name', sr.id`,
    [subject],
  );
  return rows;
}

const isoDate = (d) => (typeof d === "string" ? d : new Date(d).toISOString().slice(0, 10));

/** The class list for a subject, date and period, pre-filled with any earlier marks. */
export async function loadRoster(db, user, { subject, date, period }) {
  await requireAttendanceViewer(db, user, subject);
  const students = await roster(db, subject);
  const session = (
    await db.query(
      "SELECT id FROM attendance_sessions WHERE subject = $1 AND held_on = $2 AND period = $3",
      [subject, date, period],
    )
  ).rows[0];
  const marks = session
    ? (
        await db.query(
          "SELECT student_id, present FROM attendance_marks WHERE session_id = $1 AND student_id = ANY($2::text[])",
          [session.id, students.map((s) => s.id)],
        )
      ).rows
    : [];
  const byStudent = new Map(marks.map((m) => [m.student_id, m.present]));
  return {
    canMark: await teaches(db, user, subject),
    marked: marks.length > 0,
    students: students.map((s) => ({
      id: s.id,
      name: s.name || s.id,
      // Unmarked students default to present: teachers then tick the absentees.
      present: byStudent.get(s.id) ?? true,
    })),
  };
}

export async function markAttendance(db, user, { subject, date, period, marks }, today) {
  await requireAttendanceMarker(db, user, subject);
  if (date > today) throw new Error("You cannot mark attendance for a future date.");
  const students = await roster(db, subject);
  if (!students.length) throw new Error("No students take this subject.");
  const allowed = new Map(students.map((s) => [s.id, s]));
  const present = new Map();
  for (const m of marks) {
    if (!allowed.has(m.studentId))
      throw new Error("A student in the list does not take this subject.");
    present.set(m.studentId, m.present);
  }
  // Anyone left out of the request counts as present, matching the pre-filled list.
  for (const s of students) if (!present.has(s.id)) present.set(s.id, true);

  const sessionId = (
    await db.query(
      `INSERT INTO attendance_sessions(subject, held_on, period, marked_by)
       VALUES($1,$2,$3,$4)
       ON CONFLICT (subject, held_on, period)
       DO UPDATE SET marked_by = EXCLUDED.marked_by
       RETURNING id`,
      [subject, date, period, user.id],
    )
  ).rows[0].id;
  const before = new Map(
    (
      await db.query("SELECT student_id, present FROM attendance_marks WHERE session_id = $1", [
        sessionId,
      ])
    ).rows.map((r) => [r.student_id, r.present]),
  );

  let absent = 0;
  for (const [studentId, isPresent] of present) {
    const prev = before.get(studentId);
    await db.query(
      `INSERT INTO attendance_marks(session_id, student_id, present) VALUES($1,$2,$3)
       ON CONFLICT (session_id, student_id) DO UPDATE SET present = EXCLUDED.present`,
      [sessionId, studentId, isPresent],
    );
    if (!isPresent) absent += 1;
    const heldDelta = prev === undefined ? 1 : 0;
    const attendedDelta = (isPresent ? 1 : 0) - (prev ? 1 : 0);
    if (heldDelta || attendedDelta)
      await bumpTotals(db, studentId, subject, heldDelta, attendedDelta);
    if (!isPresent && prev !== false)
      await notify(db, allowed.get(studentId).owner_id, {
        area: "attendance",
        priority: "low",
        title: `Marked absent in ${subject}`,
        body: `You were marked absent on ${date}. Check the attendance planner to see where you stand.`,
        link: "/portal/attendance",
        key: `absent:${sessionId}`,
      });
  }
  return { saved: true, present: present.size - absent, absent };
}

async function bumpTotals(db, studentId, subject, heldDelta, attendedDelta) {
  const { rows } = await db.query("SELECT record FROM student_records WHERE id = $1", [studentId]);
  const record = rows[0]?.record;
  if (!record) return;
  const subjects = (record.subjects ?? []).map((s) =>
    s.subject === subject
      ? {
          ...s,
          classesHeld: (s.classesHeld ?? 0) + heldDelta,
          classesAttended: Math.max(0, (s.classesAttended ?? 0) + attendedDelta),
        }
      : s,
  );
  await db.query("UPDATE student_records SET record = $2 WHERE id = $1", [
    studentId,
    JSON.stringify({ ...record, subjects }),
  ]);
}

/** Recent classes marked for a subject, with how many were present. */
export async function recentSessions(db, user, { subject }) {
  await requireAttendanceViewer(db, user, subject);
  const { rows } = await db.query(
    `SELECT s.id, s.held_on::text AS held_on, s.period,
            count(m.*) FILTER (WHERE m.present)::int AS present,
            count(m.*) FILTER (WHERE NOT m.present)::int AS absent
       FROM attendance_sessions s LEFT JOIN attendance_marks m ON m.session_id = s.id
      WHERE s.subject = $1
      GROUP BY s.id HAVING count(m.*) > 0
      ORDER BY s.held_on DESC, s.period DESC LIMIT 15`,
    [subject],
  );
  return rows.map((r) => ({ ...r, held_on: isoDate(r.held_on) }));
}

/**
 * A student's own day-by-day attendance: one subject, or every subject when `subject` is blank.
 * Each row says whether they were present, so a percentage can be traced back to the classes.
 */
export async function myAttendance(db, user, { subject }) {
  const own = await ownStudent(db, user);
  if (!own) return { subjects: [], sessions: [], present: 0, absent: 0 };
  const mine = subjectsOf(own.record);
  if (subject && !mine.includes(subject)) throw new Error("That subject is not one of yours.");
  const wanted = subject ? [subject] : mine;
  if (!wanted.length) return { subjects: mine, sessions: [], present: 0, absent: 0 };
  const { rows } = await db.query(
    `SELECT s.subject, s.held_on::text AS held_on, s.period, m.present
       FROM attendance_marks m JOIN attendance_sessions s ON s.id = m.session_id
      WHERE m.student_id = $1 AND s.subject = ANY($2)
      ORDER BY s.held_on DESC, s.period DESC LIMIT 400`,
    [own.id, wanted],
  );
  return {
    subjects: mine,
    sessions: rows,
    present: rows.filter((r) => r.present).length,
    absent: rows.filter((r) => !r.present).length,
  };
}

/**
 * Which students have a timetable. A student's week is the slots of the subjects on their
 * record, so this says per student how many classes are scheduled and which subjects have none.
 */
export async function timetableCoverage(db, user) {
  requireStaff(user);
  const { rows } = await db.query(
    `SELECT sr.id, sr.record->>'name' AS name, sr.record->>'branch' AS branch,
            coalesce(
              (SELECT jsonb_agg(s->>'subject') FROM jsonb_array_elements(sr.record->'subjects') s),
              '[]'::jsonb
            ) AS subjects
       FROM student_records sr
      WHERE ($2::boolean OR sr.faculty_id = $1)
      ORDER BY sr.record->>'name', sr.id`,
    [user.id, isAdmin(user) && !isFaculty(user)],
  );
  const slots = await db.query(
    "SELECT subject, count(*)::int AS slots FROM timetable_slots GROUP BY subject",
  );
  const bySubject = new Map(slots.rows.map((r) => [r.subject, r.slots]));
  return rows.map((r) => {
    const subjects = (r.subjects ?? []).filter(Boolean);
    const missing = subjects.filter((s) => !bySubject.get(s));
    return {
      id: r.id,
      name: r.name || r.id,
      branch: r.branch ?? "",
      subjects,
      classes: subjects.reduce((a, s) => a + (bySubject.get(s) ?? 0), 0),
      missing,
    };
  });
}

// ------------------------------------------------------------------ timetable
/** Changing a subject's classes: its teacher, or an administrator (who builds the timetable). */
async function requireTimetableEditor(db, user, subject) {
  requireStaff(user);
  if (isAdmin(user) || (await teaches(db, user, subject))) return;
  throw new Error("You can only change the timetable for the subjects you teach.");
}

/**
 * The week's classes. A student sees the subjects on their record, a teacher the subjects they
 * teach, and an administrator every subject.
 */
export async function loadTimetable(db, user) {
  const subjects =
    isFaculty(user) && !isAdmin(user)
      ? await taughtSubjects(db, user.id)
      : await subjectsFor(db, user);
  if (!subjects.length) return { subjects: [], slots: [] };
  const { rows } = await db.query(
    `SELECT id, subject, day, to_char(start_time, 'HH24:MI') AS start,
            to_char(end_time, 'HH24:MI') AS "end", room
       FROM timetable_slots WHERE subject = ANY($1) ORDER BY day, start_time`,
    [subjects],
  );
  return { subjects, slots: rows };
}

export async function saveSlot(db, user, { subject, day, start, end, room }) {
  await requireTimetableEditor(db, user, subject);
  if (end <= start) throw new Error("A class must end after it starts.");
  const clash = await db.query(
    `SELECT 1 FROM timetable_slots
      WHERE subject = $1 AND day = $2 AND start_time < $4::time AND end_time > $3::time`,
    [subject, day, start, end],
  );
  if (clash.rowCount) throw new Error("That subject already has a class at this time.");
  await db.query(
    `INSERT INTO timetable_slots(subject, day, start_time, end_time, room, created_by)
     VALUES($1,$2,$3,$4,$5,$6)`,
    [subject, day, start, end, room, user.id],
  );
  return { saved: true };
}

export async function deleteSlot(db, user, { id }) {
  const slot = (await db.query("SELECT subject FROM timetable_slots WHERE id = $1", [id])).rows[0];
  if (!slot) throw new Error("That class was not found.");
  await requireTimetableEditor(db, user, slot.subject);
  await db.query("DELETE FROM timetable_slots WHERE id = $1", [id]);
  return { deleted: true };
}

/**
 * Gives every student with subjects on their record a week of classes. Two subjects taken by
 * the same student never land in the same period, so a student's own timetable never clashes.
 *
 * Subjects that already have classes are left exactly as they are unless `replace` is set, and
 * a subject's credits (from its syllabus) decide how many classes a week it gets. Administrators
 * only: it writes the timetable the whole campus sees.
 */
export async function generateTimetable(db, user, { replace = false } = {}) {
  requireAdminUser(user);
  const { rows: students } = await db.query(
    `SELECT sr.id,
            coalesce(
              (SELECT jsonb_agg(s->>'subject') FROM jsonb_array_elements(sr.record->'subjects') s),
              '[]'::jsonb
            ) AS subjects
       FROM student_records sr`,
  );
  const cohorts = students.map((r) => (r.subjects ?? []).filter(Boolean));
  if (!cohorts.some((c) => c.length))
    throw new Error(
      "No student has subjects on their record yet, so there is nothing to schedule.",
    );

  if (replace) await db.query("DELETE FROM timetable_slots");
  const scheduled = new Set(
    (await db.query("SELECT DISTINCT subject FROM timetable_slots")).rows.map((r) => r.subject),
  );
  const credits = new Map(
    (await db.query("SELECT subject, lectures, credits FROM lms_syllabus")).rows.map((r) => [
      r.subject,
      r,
    ]),
  );
  const taken = (
    await db.query(
      `SELECT subject, day, to_char(start_time, 'HH24:MI') AS start FROM timetable_slots`,
    )
  ).rows.map((r) => ({
    subject: r.subject,
    day: r.day,
    period: PERIODS.find((p) => p.start === r.start)?.period ?? 0,
  }));

  const plan = planTimetable({
    cohorts,
    // Three classes a week, four for a subject whose syllabus asks for more lecture hours.
    classesPerWeek: (subject) => Math.min(5, Math.max(2, credits.get(subject)?.lectures ?? 3)),
    skip: [...scheduled],
    taken,
  });
  for (const slot of plan.slots)
    await db.query(
      `INSERT INTO timetable_slots(subject, day, start_time, end_time, room, created_by)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [slot.subject, slot.day, slot.start, slot.end, slot.room, user.id],
    );

  const covered = await db.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM jsonb_array_elements(sr.record->'subjects') s
                JOIN timetable_slots t ON t.subject = s->>'subject'))::int AS with_classes,
            count(*) FILTER (WHERE jsonb_array_length(coalesce(sr.record->'subjects','[]'::jsonb)) = 0)::int
              AS without_subjects
       FROM student_records sr`,
  );
  return {
    added: plan.slots.length,
    subjects: plan.slots.reduce((set, s) => set.add(s.subject), new Set()).size,
    kept: scheduled.size,
    unplaced: plan.unplaced,
    students: covered.rows[0],
  };
}

// ---------------------------------------------------------------- subject teachers (admin)

/** Every teacher's subjects, and every subject on record to choose from. */
export async function listTeacherSubjects(db, user) {
  requireAdminUser(user);
  const [assigned, all] = await Promise.all([
    db.query("SELECT teacher_id, subject FROM teacher_subjects ORDER BY subject"),
    db.query(
      `SELECT DISTINCT s->>'subject' AS subject
         FROM student_records sr, jsonb_array_elements(sr.record->'subjects') s
        WHERE s->>'subject' IS NOT NULL ORDER BY 1`,
    ),
  ]);
  return {
    assignments: assigned.rows.map((r) => ({ teacherId: r.teacher_id, subject: r.subject })),
    subjects: all.rows.map((r) => r.subject),
  };
}

/** Replaces the subjects one teacher teaches. Only teachers can be given subjects. */
export async function setTeacherSubjects(db, user, { teacherId, subjects }) {
  requireAdminUser(user);
  const { rowCount } = await db.query(
    "SELECT 1 FROM user_roles WHERE user_id = $1 AND role = 'faculty'",
    [teacherId],
  );
  if (!rowCount) throw new Error("Subjects can only be assigned to teachers.");
  const unique = [...new Set(subjects.map((x) => x.trim()).filter(Boolean))];
  await db.query(
    "DELETE FROM teacher_subjects WHERE teacher_id = $1 AND NOT (subject = ANY($2::text[]))",
    [teacherId, unique],
  );
  for (const subject of unique)
    await db.query(
      `INSERT INTO teacher_subjects(teacher_id, subject, assigned_by) VALUES($1,$2,$3)
       ON CONFLICT DO NOTHING`,
      [teacherId, subject, user.id],
    );
  return { saved: true, subjects: unique };
}
