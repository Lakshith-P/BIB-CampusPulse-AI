import { randomUUID } from "node:crypto";

import { syncStudentLms } from "../../src/backend/lms.server.js";
import { DEMO_DOMAIN, ID_PREFIX } from "./generate.js";

// Stores generated demo data. `db` only needs query(text, params) -> { rows, rowCount }, so the
// same code runs against the real database and the in-memory one used by the tests. Callers wrap
// it in a transaction so a failure leaves nothing half-written.

async function bulk(db, table, cols, rows, { chunk = 150, suffix = "" } = {}) {
  for (let i = 0; i < rows.length; i += chunk) {
    const params = [];
    const values = rows
      .slice(i, i + chunk)
      .map(
        (row) =>
          "(" +
          cols
            .map((c) => {
              params.push(row[c] === undefined ? null : row[c]);
              return `$${params.length}`;
            })
            .join(",") +
          ")",
      )
      .join(",");
    await db.query(`INSERT INTO ${table}(${cols.join(",")}) VALUES ${values} ${suffix}`, params);
  }
}

export async function isSeeded(db) {
  const { rowCount } = await db.query("SELECT 1 FROM users WHERE email LIKE $1 LIMIT 1", [
    `%@${DEMO_DOMAIN}`,
  ]);
  return rowCount > 0;
}

/** Removes only what the demo seed created: its accounts, records and the content they own. */
export async function resetDemo(db, subjects = []) {
  const { rows } = await db.query("SELECT id FROM users WHERE email LIKE $1", [`%@${DEMO_DOMAIN}`]);
  const ids = rows.map((r) => r.id);
  await db.query("DELETE FROM student_records WHERE id LIKE $1", [`${ID_PREFIX}%`]);
  if (ids.length) {
    for (const [table, col] of [
      ["campus_interventions", "created_by"],
      ["lms_materials", "created_by"],
      ["lms_assignments", "created_by"],
      ["placement_drives", "created_by"],
      ["opportunities", "created_by"],
      ["campus_updates", "created_by"],
    ])
      await db.query(`DELETE FROM ${table} WHERE ${col} = ANY($1::uuid[])`, [ids]);
  }
  if (subjects.length)
    await db.query(
      `DELETE FROM lms_syllabus y WHERE y.subject = ANY($1::text[])
          AND NOT EXISTS (SELECT 1 FROM lms_materials m WHERE m.subject = y.subject)
          AND NOT EXISTS (SELECT 1 FROM lms_assignments a WHERE a.subject = y.subject)
          AND NOT EXISTS (SELECT 1 FROM student_records s
                           WHERE s.record->'subjects' @> jsonb_build_array(jsonb_build_object('subject', y.subject)))`,
      [subjects],
    );
  if (subjects.length)
    await db.query(
      `DELETE FROM lms_units u WHERE u.subject = ANY($1::text[])
          AND NOT EXISTS (SELECT 1 FROM lms_materials m WHERE m.subject = u.subject)
          AND NOT EXISTS (SELECT 1 FROM lms_assignments a WHERE a.subject = u.subject)
          AND NOT EXISTS (SELECT 1 FROM student_records s
                           WHERE s.record->'subjects' @> jsonb_build_array(jsonb_build_object('subject', u.subject)))`,
      [subjects],
    );
  if (ids.length) await db.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [ids]);
  return { users: ids.length };
}

export async function seedDatabase(db, data, { passwordHash }) {
  if (await isSeeded(db))
    throw new Error("Demo data is already present. Run again with --reset to rebuild it.");

  const userId = new Map(); // email -> uuid
  const teacherId = new Map(); // key -> uuid
  const people = [
    ...data.teachers.map((t) => ({ ...t, role: "faculty" })),
    ...data.students.map((s) => ({ ...s, role: "student" })),
  ];
  for (const p of people) userId.set(p.email, randomUUID());
  for (const t of data.teachers) teacherId.set(t.key, userId.get(t.email));
  const now = new Date().toISOString();

  await bulk(
    db,
    "users",
    ["id", "email", "password_hash", "display_name", "created_at"],
    people.map((p) => ({
      id: userId.get(p.email),
      email: p.email,
      password_hash: passwordHash,
      display_name: p.name,
      created_at: now,
    })),
  );
  await bulk(
    db,
    "user_roles",
    ["user_id", "role"],
    people.flatMap((p) =>
      p.role === "faculty"
        ? [
            { user_id: userId.get(p.email), role: "student" },
            { user_id: userId.get(p.email), role: "faculty" },
          ]
        : [{ user_id: userId.get(p.email), role: "student" }],
    ),
  );
  await bulk(
    db,
    "student_records",
    ["id", "owner_id", "faculty_id", "record", "updated_at"],
    data.students.map((s) => ({
      id: s.id,
      owner_id: userId.get(s.email),
      faculty_id: teacherId.get(s.teacherKey),
      record: JSON.stringify(s.record),
      updated_at: now,
    })),
  );

  // ---------------------------------------------------------------- LMS
  await bulk(db, "lms_units", ["subject", "unit", "title", "topics"], data.lms.units, {
    suffix: "ON CONFLICT (subject, unit) DO NOTHING",
  });
  await bulk(
    db,
    "lms_syllabus",
    [
      "subject",
      "code",
      "title",
      "lectures",
      "tutorials",
      "practicals",
      "credits",
      "outcomes",
      "textbooks",
      "references_list",
      "session",
      "updated_by",
    ],
    data.lms.syllabus.map((x) => ({
      subject: x.subject,
      code: x.code,
      title: x.title,
      lectures: x.lectures,
      tutorials: x.tutorials,
      practicals: x.practicals,
      credits: x.credits,
      outcomes: x.outcomes,
      textbooks: x.textbooks,
      references_list: x.references,
      session: x.session,
      updated_by: teacherId.get(x.owner),
    })),
    { suffix: "ON CONFLICT (subject) DO NOTHING" },
  );
  const materialId = new Map();
  const materialRows = data.lms.materials.map((m) => {
    const id = randomUUID();
    materialId.set(m.key, id);
    return {
      id,
      subject: m.subject,
      unit: m.unit,
      kind: m.kind,
      title: m.title,
      description: m.description,
      url: m.url,
      file_name: m.fileName ?? "",
      file_type: m.fileName ? "text/plain" : "",
      file_data: m.fileText ? Buffer.from(m.fileText, "utf8") : null,
      created_by: teacherId.get(m.owner),
    };
  });
  await bulk(
    db,
    "lms_materials",
    [
      "id",
      "subject",
      "unit",
      "kind",
      "title",
      "description",
      "url",
      "file_name",
      "file_type",
      "file_data",
      "created_by",
    ],
    materialRows,
  );
  await bulk(
    db,
    "lms_assignments",
    [
      "subject",
      "unit",
      "title",
      "instructions",
      "assigned_on",
      "due_on",
      "max_marks",
      "created_by",
    ],
    data.lms.assignments.map((a) => ({
      subject: a.subject,
      unit: a.unit,
      title: a.title,
      instructions: a.instructions,
      assigned_on: a.assignedOn,
      due_on: a.dueOn,
      max_marks: a.maxMarks,
      created_by: teacherId.get(a.owner),
    })),
    { suffix: "ON CONFLICT (subject, unit) DO NOTHING" },
  );
  const found = await db.query(
    "SELECT id, subject, unit FROM lms_assignments WHERE subject = ANY($1::text[])",
    [[...new Set(data.lms.assignments.map((a) => a.subject))]],
  );
  const assignmentId = new Map(found.rows.map((r) => [`${r.subject}|${r.unit}`, r.id]));

  await bulk(
    db,
    "lms_progress",
    ["material_id", "student_id", "completed_at"],
    data.progress.map((p) => ({
      material_id: materialId.get(p.materialKey),
      student_id: p.studentId,
      completed_at: `${p.completedOn}T12:00:00Z`,
    })),
    { suffix: "ON CONFLICT DO NOTHING" },
  );
  await bulk(
    db,
    "lms_submissions",
    [
      "assignment_id",
      "student_id",
      "answer",
      "submitted_at",
      "marks",
      "remarks",
      "graded_by",
      "graded_at",
    ],
    data.submissions
      .filter((s) => assignmentId.has(s.assignmentKey))
      .map((s) => ({
        assignment_id: assignmentId.get(s.assignmentKey),
        student_id: s.studentId,
        answer: s.answer,
        submitted_at: s.submittedAt,
        marks: s.marks,
        remarks: s.remarks,
        graded_by: s.gradedBy ? teacherId.get(s.gradedBy) : null,
        graded_at: s.gradedAt,
      })),
    { suffix: "ON CONFLICT (assignment_id, student_id) DO NOTHING" },
  );
  // Rebuild each student's record.lms from the stored rows so the Success Score sees it.
  for (const s of data.students) if (s.subjects?.length) await syncStudentLms(db, s.id);

  // ---------------------------------------------------------------- skills, mocks, ratings
  await bulk(
    db,
    "skill_assessments",
    ["student_id", "category", "topic", "score", "taken_on", "recorded_by"],
    data.students.flatMap((s) =>
      (s.assessments ?? []).map((a) => ({
        student_id: s.id,
        category: a.category,
        topic: a.topic,
        score: a.score,
        taken_on: a.takenOn,
        recorded_by: teacherId.get(s.teacherKey),
      })),
    ),
  );
  await bulk(
    db,
    "mock_interviews",
    ["student_id", "interview_date", "interviewer", "score", "feedback", "recorded_by"],
    data.students.flatMap((s) =>
      (s.mocks ?? []).map((m) => ({
        student_id: s.id,
        interview_date: m.date,
        interviewer: m.interviewer,
        score: m.score,
        feedback: m.feedback,
        recorded_by: teacherId.get(s.teacherKey),
      })),
    ),
  );
  await bulk(
    db,
    "satisfaction_ratings",
    ["student_id", "teaching", "content", "support", "facilities", "comment", "created_at"],
    data.ratings.map((r) => ({
      student_id: r.studentId,
      teaching: r.teaching,
      content: r.content,
      support: r.support,
      facilities: r.facilities,
      comment: r.comment,
      created_at: `${r.createdOn}T10:00:00Z`,
    })),
  );

  // ---------------------------------------------------------------- placement
  const driveId = new Map();
  await bulk(
    db,
    "placement_drives",
    [
      "id",
      "company",
      "role_title",
      "description",
      "package",
      "drive_date",
      "deadline",
      "min_cgpa",
      "max_backlogs",
      "branches",
      "grad_year",
      "requires_assessment",
      "link",
      "created_by",
    ],
    data.drives.map((d) => {
      const id = randomUUID();
      driveId.set(d.key, id);
      return {
        id,
        company: d.company,
        role_title: d.roleTitle,
        description: d.description,
        package: d.package,
        drive_date: d.driveDate,
        deadline: d.deadline,
        min_cgpa: d.minCgpa,
        max_backlogs: d.maxBacklogs,
        branches: d.branches,
        grad_year: d.gradYear,
        requires_assessment: d.requiresAssessment,
        link: "",
        created_by: teacherId.get(d.owner),
      };
    }),
  );
  await bulk(
    db,
    "drive_applications",
    ["drive_id", "student_id", "status", "applied_at", "updated_at"],
    data.applications.map((a) => ({
      drive_id: driveId.get(a.driveKey),
      student_id: a.studentId,
      status: a.status,
      applied_at: `${a.appliedOn}T10:00:00Z`,
      updated_at: now,
    })),
  );

  // ---------------------------------------------------------------- engagement
  const opportunityId = new Map();
  await bulk(
    db,
    "opportunities",
    [
      "id",
      "type",
      "title",
      "purpose",
      "benefits",
      "requirements",
      "eligibility",
      "how_to_apply",
      "deadline",
      "link",
      "created_by",
    ],
    data.opportunities.map((o) => {
      const id = randomUUID();
      opportunityId.set(o.key, id);
      return {
        id,
        type: o.type,
        title: o.title,
        purpose: o.purpose,
        benefits: o.benefits,
        requirements: o.requirements,
        eligibility: o.eligibility,
        how_to_apply: o.howToApply,
        deadline: o.deadline || null,
        link: o.link,
        created_by: teacherId.get(o.owner),
      };
    }),
  );
  const teacherOf = new Map(data.students.map((s) => [s.id, s.teacherKey]));
  await bulk(
    db,
    "opportunity_participation",
    ["opportunity_id", "student_id", "status", "evidence", "verified", "verified_by", "updated_at"],
    data.participation.map((p) => ({
      opportunity_id: opportunityId.get(p.opportunityKey),
      student_id: p.studentId,
      status: p.status,
      evidence: p.evidence,
      verified: p.verified,
      verified_by: p.verified ? teacherId.get(teacherOf.get(p.studentId)) : null,
      updated_at: now,
    })),
    { suffix: "ON CONFLICT DO NOTHING" },
  );

  // ---------------------------------------------------------------- support, complaints, updates
  await bulk(
    db,
    "campus_interventions",
    [
      "student_id",
      "created_by",
      "reason",
      "action",
      "priority",
      "owner",
      "follow_up_date",
      "status",
      "outcome",
      "created_at",
    ],
    data.interventions.map((i) => ({
      student_id: i.studentId,
      created_by: teacherId.get(i.teacherKey),
      reason: i.reason,
      action: i.action,
      priority: i.priority,
      owner: i.owner,
      follow_up_date: i.followUpDate,
      status: i.status,
      outcome: i.outcome,
      created_at: `${i.createdOn}T09:00:00Z`,
    })),
  );
  const studentUser = new Map(data.students.map((s) => [s.id, userId.get(s.email)]));
  const admin = await db.query("SELECT user_id FROM user_roles WHERE role = 'admin' LIMIT 1");
  await bulk(
    db,
    "complaints",
    [
      "user_id",
      "category",
      "subject",
      "body",
      "status",
      "response",
      "reviewed_by",
      "responded_at",
      "created_at",
    ],
    data.complaints.map((c) => ({
      user_id: studentUser.get(c.studentId),
      category: c.category,
      subject: c.subject,
      body: c.body,
      status: c.status,
      response: c.response,
      reviewed_by: c.response ? (admin.rows[0]?.user_id ?? null) : null,
      responded_at: c.response ? now : null,
      created_at: `${c.createdOn}T11:00:00Z`,
    })),
  );
  await bulk(
    db,
    "campus_updates",
    ["category", "title", "body", "company", "event_date", "created_by"],
    data.updates.map((u) => ({
      category: u.category,
      title: u.title,
      body: u.body,
      company: u.company,
      event_date: u.eventDate || null,
      created_by: teacherId.get(u.owner),
    })),
  );
  await bulk(
    db,
    "login_events",
    ["user_id", "at"],
    data.logins.map((l) => ({ user_id: userId.get(l.email), at: l.at })),
    { chunk: 300 },
  );

  return {
    teachers: data.teachers.length,
    students: data.students.length,
    subjects: new Set(data.lms.units.map((u) => u.subject)).size,
    materials: data.lms.materials.length,
    assignments: data.lms.assignments.length,
    submissions: data.submissions.length,
    skillTests: data.students.reduce((a, s) => a + (s.assessments?.length ?? 0), 0),
    mockInterviews: data.students.reduce((a, s) => a + (s.mocks?.length ?? 0), 0),
    drives: data.drives.length,
    applications: data.applications.length,
    opportunities: data.opportunities.length,
    participation: data.participation.length,
    ratings: data.ratings.length,
    interventions: data.interventions.length,
    complaints: data.complaints.length,
    updates: data.updates.length,
    logins: data.logins.length,
  };
}
