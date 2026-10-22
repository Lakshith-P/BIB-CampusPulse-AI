import {
  isAdmin,
  isFaculty,
  isStaff,
  notify,
  ownStudent,
  requireOwnStudent,
  requireStaff,
  requireSubjectManager,
  subjectsOf,
  visibleStudent,
} from "./access.server.js";
import { decodeFile, encodeFile } from "./files.server.js";

export const UNITS = [1, 2, 3, 4, 5, 6];

// ------------------------------------------------------------------ reading
async function studentsTaking(db, subject) {
  const { rows } = await db.query(
    `SELECT id, owner_id FROM student_records
      WHERE record->'subjects' @> jsonb_build_array(jsonb_build_object('subject', $1::text))`,
    [subject],
  );
  return rows;
}

/** Subjects the caller can open: a student's own, or those of students a teacher/admin can see. */
export async function subjectsFor(db, user) {
  if (!isStaff(user)) {
    const own = await ownStudent(db, user);
    return own ? subjectsOf(own.record) : [];
  }
  const { rows } = await db.query(
    `SELECT DISTINCT s->>'subject' AS subject
       FROM student_records sr, jsonb_array_elements(sr.record->'subjects') s
      WHERE ($2::boolean OR sr.faculty_id = $1)
      ORDER BY 1`,
    [user.id, isAdmin(user)],
  );
  return rows.map((r) => r.subject);
}

/**
 * Everything the LMS pages show for the caller: per subject, six units with syllabus topics,
 * materials, the assignment, and (for students) their lesson progress and submission.
 */
export async function loadLms(db, user) {
  const subjects = await subjectsFor(db, user);
  if (!subjects.length) return { subjects: [], activity: await loginActivity(db, user.id) };
  const own = isStaff(user) ? null : await ownStudent(db, user);
  const [units, materials, assignments, progress, submissions, counts, syllabus] = await Promise.all([
    db.query("SELECT subject, unit, title, topics FROM lms_units WHERE subject = ANY($1)", [
      subjects,
    ]),
    db.query(
      `SELECT id, subject, unit, kind, title, description, url, file_name, file_type, created_at
         FROM lms_materials WHERE subject = ANY($1) ORDER BY created_at`,
      [subjects],
    ),
    db.query(
      `SELECT id, subject, unit, title, instructions, assigned_on::text AS assigned_on,
              due_on::text AS due_on, max_marks
         FROM lms_assignments WHERE subject = ANY($1)`,
      [subjects],
    ),
    own
      ? db.query("SELECT material_id FROM lms_progress WHERE student_id = $1", [own.id])
      : { rows: [] },
    own
      ? db.query(
          `SELECT assignment_id, answer, file_name, submitted_at, marks, remarks, graded_at
             FROM lms_submissions WHERE student_id = $1`,
          [own.id],
        )
      : { rows: [] },
    isStaff(user)
      ? db.query(
          `SELECT a.id AS assignment_id, count(s.id)::int AS submitted,
                  count(s.id) FILTER (WHERE s.graded_at IS NOT NULL)::int AS graded
             FROM lms_assignments a LEFT JOIN lms_submissions s ON s.assignment_id = a.id
            WHERE a.subject = ANY($1) GROUP BY a.id`,
          [subjects],
        )
      : { rows: [] },
    db.query(
      `SELECT subject, code, title, lectures, tutorials, practicals, credits,
              outcomes, textbooks, references_list AS references, session
         FROM lms_syllabus WHERE subject = ANY($1)`,
      [subjects],
    ),
  ]);
  const done = new Set(progress.rows.map((r) => r.material_id));
  const subByAssignment = new Map(submissions.rows.map((r) => [r.assignment_id, r]));
  const countBy = new Map(counts.rows.map((r) => [r.assignment_id, r]));
  return {
    subjects: subjects.map((subject) => ({
      subject,
      syllabus: syllabus.rows.find((r) => r.subject === subject) ?? null,
      units: UNITS.map((unit) => {
        const meta = units.rows.find((u) => u.subject === subject && u.unit === unit);
        const assignment = assignments.rows.find((a) => a.subject === subject && a.unit === unit);
        return {
          unit,
          title: meta?.title ?? `Unit ${unit}`,
          topics: meta?.topics ?? "",
          configured: Boolean(meta),
          materials: materials.rows
            .filter((m) => m.subject === subject && m.unit === unit)
            .map((m) => ({
              ...m,
              created_at: new Date(m.created_at).toISOString(),
              hasFile: Boolean(m.file_name),
              completed: done.has(m.id),
            })),
          assignment: assignment
            ? {
                ...assignment,
                submission: subByAssignment.get(assignment.id)
                  ? {
                      ...subByAssignment.get(assignment.id),
                      submitted_at: new Date(
                        subByAssignment.get(assignment.id).submitted_at,
                      ).toISOString(),
                    }
                  : null,
                stats: countBy.get(assignment.id) ?? null,
              }
            : null,
        };
      }),
    })),
    activity: await loginActivity(db, user.id),
  };
}

/** Real sign-in counts for the LMS activity card. */
export async function loginActivity(db, userId) {
  const { rows } = await db.query(
    `SELECT count(*) FILTER (WHERE at > now() - interval '7 days')::int AS week,
            count(*) FILTER (WHERE at > now() - interval '30 days')::int AS month,
            max(at) AS last_login
       FROM login_events WHERE user_id = $1`,
    [userId],
  );
  const r = rows[0];
  return {
    week: r.week,
    month: r.month,
    perWeek: Math.round((r.month / (30 / 7)) * 10) / 10,
    lastLogin: r.last_login ? new Date(r.last_login).toISOString() : null,
  };
}

// ------------------------------------------------------------------ the score record
/**
 * Rebuilds a student's record.lms from the stored materials, progress, assignments and
 * submissions, so lesson completion and assignment submission feed the Success Score.
 * Subjects with no LMS content are left exactly as they were.
 */
export async function syncStudentLms(db, studentId) {
  const { rows } = await db.query("SELECT record FROM student_records WHERE id = $1", [studentId]);
  if (!rows[0]) return;
  const record = rows[0].record;
  const subjects = subjectsOf(record);
  if (!subjects.length) return;
  const [units, materials, assignments, progress, submissions] = await Promise.all([
    db.query("SELECT subject, unit, title FROM lms_units WHERE subject = ANY($1)", [subjects]),
    db.query(
      "SELECT id, subject, unit, title, url, file_name FROM lms_materials WHERE subject = ANY($1) ORDER BY created_at",
      [subjects],
    ),
    db.query(
      "SELECT id, subject, unit, title, due_on::text AS due_on FROM lms_assignments WHERE subject = ANY($1)",
      [subjects],
    ),
    db.query("SELECT material_id FROM lms_progress WHERE student_id = $1", [studentId]),
    db.query("SELECT assignment_id, marks FROM lms_submissions WHERE student_id = $1", [studentId]),
  ]);
  const done = new Set(progress.rows.map((r) => r.material_id));
  const subOf = new Map(submissions.rows.map((r) => [r.assignment_id, r]));
  const built = [];
  for (const subject of subjects) {
    const mats = materials.rows.filter((m) => m.subject === subject);
    const asg = assignments.rows.filter((a) => a.subject === subject);
    const meta = units.rows.filter((u) => u.subject === subject);
    if (!mats.length && !asg.length && !meta.length) continue;
    const unitList = [];
    for (const unit of UNITS) {
      const title = meta.find((u) => u.unit === unit)?.title;
      const unitMats = mats.filter((m) => m.unit === unit);
      const a = asg.find((x) => x.unit === unit);
      if (!title && !unitMats.length && !a) continue;
      const sub = a ? subOf.get(a.id) : null;
      unitList.push({
        unit,
        title: title ?? `Unit ${unit}`,
        lessons: unitMats.map((m) => ({
          title: m.title,
          completed: done.has(m.id),
          resource: m.url || m.file_name || "",
        })),
        assignment: a
          ? {
              title: a.title,
              deadline: a.due_on,
              submitted: Boolean(sub),
              marks: sub?.marks === null || sub?.marks === undefined ? null : Number(sub.marks),
            }
          : { title: "—", deadline: "", submitted: false, marks: null },
      });
    }
    built.push({ subject, units: unitList });
  }
  if (!built.length) return;
  const managed = new Set(built.map((b) => b.subject));
  const kept = (record.lms ?? []).filter((l) => !managed.has(l.subject));
  await db.query(
    `UPDATE student_records SET record = jsonb_set(record, '{lms}', $2::jsonb), updated_at = now() WHERE id = $1`,
    [studentId, JSON.stringify([...kept, ...built])],
  );
}

async function syncSubject(db, subject) {
  for (const s of await studentsTaking(db, subject)) await syncStudentLms(db, s.id);
}

// ------------------------------------------------------------------ teacher actions
export async function saveUnit(db, user, { subject, unit, title, topics }) {
  await requireSubjectManager(db, user, subject);
  await db.query(
    `INSERT INTO lms_units(subject, unit, title, topics) VALUES($1,$2,$3,$4)
     ON CONFLICT (subject, unit) DO UPDATE SET title = EXCLUDED.title, topics = EXCLUDED.topics`,
    [subject, unit, title, topics],
  );
  await syncSubject(db, subject);
  return { saved: true };
}

/** The course header of a subject's syllabus: code, credits, outcomes, text books, references. */
export async function saveSyllabus(db, user, data) {
  await requireSubjectManager(db, user, data.subject);
  await db.query(
    `INSERT INTO lms_syllabus(subject, code, title, lectures, tutorials, practicals, credits,
                              outcomes, textbooks, references_list, session, updated_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (subject) DO UPDATE SET
       code = EXCLUDED.code, title = EXCLUDED.title, lectures = EXCLUDED.lectures,
       tutorials = EXCLUDED.tutorials, practicals = EXCLUDED.practicals,
       credits = EXCLUDED.credits, outcomes = EXCLUDED.outcomes,
       textbooks = EXCLUDED.textbooks, references_list = EXCLUDED.references_list,
       session = EXCLUDED.session, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [
      data.subject,
      data.code,
      data.title,
      data.lectures,
      data.tutorials,
      data.practicals,
      data.credits,
      data.outcomes,
      data.textbooks,
      data.references,
      data.session,
      user.id,
    ],
  );
  return { saved: true };
}

export async function addMaterial(db, user, data) {
  await requireSubjectManager(db, user, data.subject);
  if (data.kind === "file" && !data.file) throw new Error("Choose a file to upload.");
  if ((data.kind === "video" || data.kind === "link") && !data.url)
    throw new Error("Add the link for this resource.");
  const file = data.kind === "file" ? decodeFile(data.file) : null;
  const { rows } = await db.query(
    `INSERT INTO lms_materials(subject, unit, kind, title, description, url, file_name, file_type, file_data, created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [
      data.subject,
      data.unit,
      data.kind,
      data.title,
      data.description,
      data.kind === "file" ? "" : data.url,
      file?.name ?? "",
      file?.type ?? "",
      file?.buffer ?? null,
      user.id,
    ],
  );
  await syncSubject(db, data.subject);
  return { saved: true, id: rows[0].id };
}

export async function deleteMaterial(db, user, { id }) {
  const { rows } = await db.query("SELECT subject FROM lms_materials WHERE id = $1", [id]);
  if (!rows[0]) throw new Error("That material no longer exists.");
  await requireSubjectManager(db, user, rows[0].subject);
  await db.query("DELETE FROM lms_materials WHERE id = $1", [id]);
  await syncSubject(db, rows[0].subject);
  return { saved: true };
}

export async function saveAssignment(db, user, data) {
  await requireSubjectManager(db, user, data.subject);
  const { rows } = await db.query(
    `INSERT INTO lms_assignments(subject, unit, title, instructions, assigned_on, due_on, max_marks, created_by)
     VALUES($1,$2,$3,$4,COALESCE(NULLIF($5,'')::date, current_date),$6::date,$7,$8)
     ON CONFLICT (subject, unit) DO UPDATE
       SET title = EXCLUDED.title, instructions = EXCLUDED.instructions,
           due_on = EXCLUDED.due_on, max_marks = EXCLUDED.max_marks
     RETURNING id, (xmax = 0) AS created`,
    [
      data.subject,
      data.unit,
      data.title,
      data.instructions,
      data.assignedOn ?? "",
      data.dueOn,
      data.maxMarks,
      user.id,
    ],
  );
  await syncSubject(db, data.subject);
  if (rows[0].created) {
    for (const s of await studentsTaking(db, data.subject))
      await notify(db, s.owner_id, {
        area: "Assignment",
        priority: "medium",
        title: `New assignment: ${data.title} (${data.subject})`,
        body: `Due ${data.dueOn}.`,
        link: "/portal/lms",
        key: `assignment-new:${rows[0].id}`,
      });
  }
  return { saved: true, id: rows[0].id };
}

export async function deleteAssignment(db, user, { id }) {
  const { rows } = await db.query("SELECT subject FROM lms_assignments WHERE id = $1", [id]);
  if (!rows[0]) throw new Error("That assignment no longer exists.");
  await requireSubjectManager(db, user, rows[0].subject);
  await db.query("DELETE FROM lms_assignments WHERE id = $1", [id]);
  await syncSubject(db, rows[0].subject);
  return { saved: true };
}

/** Submissions for one assignment, limited to students the caller can see. */
export async function listSubmissions(db, user, { assignmentId }) {
  requireStaff(user);
  const a = await db.query(
    "SELECT id, subject, max_marks, due_on::text AS due_on FROM lms_assignments WHERE id = $1",
    [assignmentId],
  );
  if (!a.rows[0]) throw new Error("That assignment no longer exists.");
  await requireSubjectManager(db, user, a.rows[0].subject);
  const { rows } = await db.query(
    `SELECT sr.id AS student_id, sr.record->>'name' AS name,
            s.id AS submission_id, s.answer, s.file_name, s.submitted_at, s.marks, s.remarks, s.graded_at
       FROM student_records sr
       LEFT JOIN lms_submissions s ON s.student_id = sr.id AND s.assignment_id = $1
      WHERE sr.record->'subjects' @> jsonb_build_array(jsonb_build_object('subject', $4::text))
        AND ($3::boolean OR sr.faculty_id = $2)
      ORDER BY name`,
    [assignmentId, user.id, isAdmin(user), a.rows[0].subject],
  );
  return {
    assignment: a.rows[0],
    students: rows.map((r) => ({
      ...r,
      submitted_at: r.submitted_at ? new Date(r.submitted_at).toISOString() : null,
      late: r.submitted_at ? r.submitted_at.toISOString?.().slice(0, 10) > a.rows[0].due_on : false,
      marks: r.marks === null ? null : Number(r.marks),
    })),
  };
}

export async function gradeSubmission(db, user, { submissionId, marks, remarks }) {
  requireStaff(user);
  const { rows } = await db.query(
    `SELECT s.id, s.student_id, a.subject, a.max_marks, a.title, sr.owner_id, sr.faculty_id
       FROM lms_submissions s
       JOIN lms_assignments a ON a.id = s.assignment_id
       JOIN student_records sr ON sr.id = s.student_id
      WHERE s.id = $1`,
    [submissionId],
  );
  const s = rows[0];
  if (!s) throw new Error("That submission no longer exists.");
  if (!isAdmin(user) && s.faculty_id !== user.id)
    throw new Error("You can only grade students assigned to you.");
  if (marks < 0 || marks > s.max_marks)
    throw new Error(`Marks must be between 0 and ${s.max_marks}.`);
  await db.query(
    "UPDATE lms_submissions SET marks = $2, remarks = $3, graded_by = $4, graded_at = now() WHERE id = $1",
    [submissionId, marks, remarks, user.id],
  );
  await syncStudentLms(db, s.student_id);
  await notify(db, s.owner_id, {
    area: "Assignment",
    priority: "low",
    title: `${s.title} (${s.subject}) was graded`,
    body: `You scored ${marks} / ${s.max_marks}.${remarks ? " Your teacher left a remark." : ""}`,
    link: "/portal/lms",
    key: `graded:${submissionId}:${marks}`,
  });
  return { saved: true };
}

// ------------------------------------------------------------------ student actions
export async function setLessonDone(db, user, { materialId, done }) {
  const own = await requireOwnStudent(db, user);
  const m = await db.query("SELECT subject FROM lms_materials WHERE id = $1", [materialId]);
  if (!m.rows[0] || !subjectsOf(own.record).includes(m.rows[0].subject))
    throw new Error("That lesson is not part of your subjects.");
  if (done)
    await db.query(
      "INSERT INTO lms_progress(material_id, student_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [materialId, own.id],
    );
  else
    await db.query("DELETE FROM lms_progress WHERE material_id = $1 AND student_id = $2", [
      materialId,
      own.id,
    ]);
  await syncStudentLms(db, own.id);
  return { saved: true };
}

export async function submitAssignment(db, user, { assignmentId, answer, file }) {
  const own = await requireOwnStudent(db, user);
  const a = await db.query("SELECT subject, title FROM lms_assignments WHERE id = $1", [
    assignmentId,
  ]);
  if (!a.rows[0] || !subjectsOf(own.record).includes(a.rows[0].subject))
    throw new Error("That assignment is not part of your subjects.");
  if (!answer.trim() && !file)
    throw new Error("Write an answer or attach a file before submitting.");
  const decoded = file ? decodeFile(file) : null;
  const existing = await db.query(
    "SELECT graded_at FROM lms_submissions WHERE assignment_id = $1 AND student_id = $2",
    [assignmentId, own.id],
  );
  if (existing.rows[0]?.graded_at)
    throw new Error("This submission has been graded, so it can no longer be changed.");
  await db.query(
    `INSERT INTO lms_submissions(assignment_id, student_id, answer, file_name, file_type, file_data)
     VALUES($1,$2,$3,$4,$5,$6)
     ON CONFLICT (assignment_id, student_id) DO UPDATE
       SET answer = EXCLUDED.answer, file_name = EXCLUDED.file_name, file_type = EXCLUDED.file_type,
           file_data = EXCLUDED.file_data, submitted_at = now()`,
    [
      assignmentId,
      own.id,
      answer,
      decoded?.name ?? "",
      decoded?.type ?? "",
      decoded?.buffer ?? null,
    ],
  );
  await syncStudentLms(db, own.id);
  if (own.faculty_id)
    await notify(db, own.faculty_id, {
      area: "Assignment",
      priority: "low",
      title: `${own.record.name} submitted ${a.rows[0].title} (${a.rows[0].subject})`,
      link: "/portal/lms",
      key: `submitted:${assignmentId}:${own.id}:${new Date().toISOString().slice(0, 10)}`,
    });
  return { saved: true };
}

// ------------------------------------------------------------------ downloads
/** A material the caller may read (their subject, or any as staff), or a submission they may see. */
export async function downloadFile(db, user, { kind, id }) {
  if (kind === "material") {
    const { rows } = await db.query(
      "SELECT subject, file_name, file_type, file_data FROM lms_materials WHERE id = $1 AND file_data IS NOT NULL",
      [id],
    );
    const m = rows[0];
    if (!m) throw new Error("That file is not available.");
    if (isStaff(user)) {
      // Teachers may open files of subjects they manage.
      await requireSubjectManager(db, user, m.subject);
    } else {
      const own = await ownStudent(db, user);
      if (!own || !subjectsOf(own.record).includes(m.subject))
        throw new Error("That file is not part of your subjects.");
    }
    return encodeFile(m.file_name, m.file_type, m.file_data);
  }
  const { rows } = await db.query(
    "SELECT student_id, file_name, file_type, file_data FROM lms_submissions WHERE id = $1 AND file_data IS NOT NULL",
    [id],
  );
  const s = rows[0];
  if (!s) throw new Error("That file is not available.");
  if (!(await visibleStudent(db, user, s.student_id)))
    throw new Error("You cannot open this file.");
  return encodeFile(s.file_name, s.file_type, s.file_data);
}

export const canGrade = (user) => isFaculty(user) || isAdmin(user);
