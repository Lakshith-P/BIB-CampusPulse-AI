import {
  isAdmin,
  isStaff,
  notify,
  ownStudent,
  requireOwnStudent,
  requireStaff,
  staffStudent,
  visibleStudent,
} from "./access.server.js";
import { checkEligibility } from "@/lib/scoring";
import { studentSchema } from "@/lib/student-validation";

const toDrive = (r) => ({
  id: r.id,
  company: r.company,
  roleTitle: r.role_title,
  description: r.description,
  package: r.package,
  driveDate: r.drive_date,
  deadline: r.deadline,
  minCgpa: Number(r.min_cgpa),
  maxBacklogs: r.max_backlogs,
  branches: r.branches ?? [],
  gradYear: r.grad_year,
  requiresAssessment: r.requires_assessment,
  link: r.link,
});

const DRIVE_COLUMNS = `d.id, d.company, d.role_title, d.description, d.package, d.drive_date::text AS drive_date,
  d.deadline::text AS deadline, d.min_cgpa, d.max_backlogs, d.branches, d.grad_year, d.requires_assessment, d.link`;

/** Evaluates a drive against a stored student record. Eligibility is never assumed. */
export function evaluate(record, drive) {
  const parsed = studentSchema.safeParse(record);
  if (!parsed.success) return null;
  return checkEligibility(parsed.data, drive);
}

/**
 * Students see every drive with their own eligibility checklist and application status.
 * Teachers and administrators see each drive with the number of applicants.
 */
export async function listDrives(db, user, today) {
  const { rows } = await db.query(
    `SELECT ${DRIVE_COLUMNS}, d.created_at FROM placement_drives d ORDER BY d.deadline >= $1::date DESC, d.deadline`,
    [today],
  );
  if (isStaff(user)) {
    const counts = await db.query(
      `SELECT drive_id, count(*)::int AS applicants,
              count(*) FILTER (WHERE status = 'shortlisted')::int AS shortlisted,
              count(*) FILTER (WHERE status = 'selected')::int AS selected
         FROM drive_applications GROUP BY drive_id`,
    );
    const by = new Map(counts.rows.map((c) => [c.drive_id, c]));
    return rows.map((r) => ({
      ...toDrive(r),
      open: r.deadline >= today,
      stats: by.get(r.id) ?? { applicants: 0, shortlisted: 0, selected: 0 },
    }));
  }
  const own = await ownStudent(db, user);
  const apps = own
    ? await db.query("SELECT drive_id, status FROM drive_applications WHERE student_id = $1", [
        own.id,
      ])
    : { rows: [] };
  const status = new Map(apps.rows.map((a) => [a.drive_id, a.status]));
  return rows.map((r) => {
    const drive = toDrive(r);
    return {
      ...drive,
      open: r.deadline >= today,
      application: status.get(r.id) ?? null,
      eligibility: own ? evaluate(own.record, drive) : null,
    };
  });
}

export async function saveDrive(db, user, data, today) {
  requireStaff(user);
  const { rows } = await db.query(
    `INSERT INTO placement_drives(company, role_title, description, package, drive_date, deadline,
        min_cgpa, max_backlogs, branches, grad_year, requires_assessment, link, created_by)
     VALUES($1,$2,$3,$4,NULLIF($5,'')::date,$6::date,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [
      data.company,
      data.roleTitle,
      data.description,
      data.package,
      data.driveDate,
      data.deadline,
      data.minCgpa,
      data.maxBacklogs,
      data.branches,
      data.gradYear ?? null,
      data.requiresAssessment,
      data.link,
      user.id,
    ],
  );
  const id = rows[0].id;
  // Tell the students who actually meet the criteria.
  const drive = { ...data, id };
  const students = await db.query(
    "SELECT owner_id, record FROM student_records WHERE owner_id IS NOT NULL",
  );
  for (const s of students.rows) {
    const result = evaluate(s.record, drive);
    if (result?.eligible && data.deadline >= today)
      await notify(db, s.owner_id, {
        area: "Placement",
        priority: "medium",
        title: `New drive: ${data.company} (${data.roleTitle})`,
        body: `You meet the listed criteria. Apply by ${data.deadline}.`,
        link: "/portal/placement",
        key: `drive:${id}`,
      });
  }
  return { saved: true, id };
}

export async function deleteDrive(db, user, { id }) {
  requireStaff(user);
  const result = await db.query(
    "DELETE FROM placement_drives WHERE id = $1 AND ($2::boolean OR created_by = $3)",
    [id, isAdmin(user), user.id],
  );
  if (!result.rowCount) throw new Error("You cannot remove this drive.");
  return { saved: true };
}

export async function applyToDrive(db, user, { driveId }, today) {
  const own = await requireOwnStudent(db, user);
  const d = await db.query(`SELECT ${DRIVE_COLUMNS} FROM placement_drives d WHERE d.id = $1`, [
    driveId,
  ]);
  if (!d.rows[0]) throw new Error("That drive no longer exists.");
  if (d.rows[0].deadline < today) throw new Error("The deadline for this drive has passed.");
  const result = evaluate(own.record, toDrive(d.rows[0]));
  if (!result) throw new Error("Your record is incomplete, so eligibility cannot be checked yet.");
  if (!result.eligible) throw new Error(result.explanation);
  await db.query(
    "INSERT INTO drive_applications(drive_id, student_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
    [driveId, own.id],
  );
  if (own.faculty_id)
    await notify(db, own.faculty_id, {
      area: "Placement",
      priority: "low",
      title: `${own.record.name} applied to ${d.rows[0].company}`,
      link: "/portal/placement",
      key: `applied:${driveId}:${own.id}`,
    });
  return { saved: true };
}

export async function listApplicants(db, user, { driveId }) {
  requireStaff(user);
  const { rows } = await db.query(
    `SELECT a.student_id, a.status, a.applied_at, sr.record->>'name' AS name,
            sr.record->>'branch' AS branch, sr.record->>'cgpa' AS cgpa
       FROM drive_applications a JOIN student_records sr ON sr.id = a.student_id
      WHERE a.drive_id = $1 AND ($3::boolean OR sr.faculty_id = $2)
      ORDER BY a.applied_at`,
    [driveId, user.id, isAdmin(user)],
  );
  return rows.map((r) => ({ ...r, applied_at: new Date(r.applied_at).toISOString() }));
}

export async function setApplicationStatus(db, user, { driveId, studentId, status }) {
  const student = await staffStudent(db, user, studentId);
  const result = await db.query(
    `UPDATE drive_applications SET status = $3, updated_at = now() WHERE drive_id = $1 AND student_id = $2
     RETURNING (SELECT company FROM placement_drives WHERE id = $1) AS company`,
    [driveId, studentId, status],
  );
  if (!result.rowCount) throw new Error("That student has not applied to this drive.");
  await notify(db, student.owner_id, {
    area: "Placement",
    priority: status === "selected" ? "high" : "medium",
    title: `${result.rows[0].company}: your application is now ${status}`,
    link: "/portal/placement",
    key: `application:${driveId}:${studentId}:${status}`,
  });
  return { saved: true };
}

// ------------------------------------------------------------------ mock interviews
async function refreshMockCount(db, studentId) {
  await db.query(
    `UPDATE student_records
        SET record = jsonb_set(record, '{mockInterviews}',
              to_jsonb((SELECT count(*)::int FROM mock_interviews WHERE student_id = $1))),
            updated_at = now()
      WHERE id = $1`,
    [studentId],
  );
}

export async function addMockInterview(db, user, data) {
  await staffStudent(db, user, data.studentId);
  await db.query(
    `INSERT INTO mock_interviews(student_id, interview_date, interviewer, score, feedback, recorded_by)
     VALUES($1,$2::date,$3,$4,$5,$6)`,
    [data.studentId, data.date, data.interviewer, data.score ?? null, data.feedback, user.id],
  );
  await refreshMockCount(db, data.studentId);
  return { saved: true };
}

export async function deleteMockInterview(db, user, { id }) {
  const { rows } = await db.query("SELECT student_id FROM mock_interviews WHERE id = $1", [id]);
  if (!rows[0]) throw new Error("That interview no longer exists.");
  await staffStudent(db, user, rows[0].student_id);
  await db.query("DELETE FROM mock_interviews WHERE id = $1", [id]);
  await refreshMockCount(db, rows[0].student_id);
  return { saved: true };
}

export async function listMockInterviews(db, user, { studentId }) {
  const target = studentId ?? (await requireOwnStudent(db, user)).id;
  if (!(await visibleStudent(db, user, target))) throw new Error("You cannot see this student.");
  const { rows } = await db.query(
    `SELECT id, interview_date::text AS interview_date, interviewer, score, feedback
       FROM mock_interviews WHERE student_id = $1 ORDER BY interview_date DESC`,
    [target],
  );
  return rows.map((r) => ({ ...r, score: r.score === null ? null : Number(r.score) }));
}
