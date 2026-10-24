import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/backend/auth-middleware";
import { hashPassword, limitByIp } from "@/backend/auth.server";
import { randomBytes } from "node:crypto";
import { query, withTransaction } from "@/backend/db.server";
import { backfillStudentRecords, cohortStanding } from "@/backend/student-record.server";
import { studentSchema } from "@/lib/student-validation";
import { emptyStudent } from "@/lib/student-defaults";
// Which student records a user may see: their own, those assigned to them as faculty, or all as admin.
// Parameters: $1 user id, $2 is faculty, $3 is admin.
const VISIBLE = `(sr.owner_id = $1 OR ($2::boolean AND sr.faculty_id = $1) OR $3::boolean)`;
const flags = (roles) => [roles.includes("faculty"), roles.includes("admin")];
export const loadCampus = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { user } = context;
    const [isFaculty, isAdmin] = flags(user.roles);
    if (isAdmin) await withTransaction((db) => backfillStudentRecords(db));
    const [me, records, interventions] = await Promise.all([
      query(
        "SELECT id, email, display_name, phone, address, bio, linkedin_url, github_url, created_at FROM users WHERE id = $1",
        [user.id],
      ),
      query(
        `SELECT sr.id, sr.owner_id, sr.faculty_id, sr.record, sr.updated_at,
                o.email AS owner_email, o.display_name AS owner_name,
                f.email AS mentor_email, f.display_name AS mentor_name
           FROM student_records sr
           LEFT JOIN users o ON o.id = sr.owner_id
           LEFT JOIN users f ON f.id = sr.faculty_id
          WHERE ${VISIBLE} ORDER BY sr.id`,
        [user.id, isFaculty, isAdmin],
      ),
      query(
        `SELECT ci.id, ci.student_id, ci.created_by, ci.reason, ci.action, ci.priority, ci.owner, ci.follow_up_date::text AS follow_up_date, ci.status, ci.outcome, ci.created_at
             FROM campus_interventions ci JOIN student_records sr ON sr.id = ci.student_id WHERE ${VISIBLE} ORDER BY ci.created_at DESC`,
        [user.id, isFaculty, isAdmin],
      ),
    ]);
    const row = me.rows[0];
    return {
      profile: {
        id: user.id,
        email: row.email,
        display_name: row.display_name,
        phone: row.phone,
        address: row.address,
        bio: row.bio,
        linkedin_url: row.linkedin_url,
        github_url: row.github_url,
        created_at: row.created_at,
      },
      roles: user.roles.map((role) => ({ role })),
      records: records.rows,
      interventions: interventions.rows,
    };
  });
export const saveCampusStudent = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      student: studentSchema,
      ownerId: z.string().uuid().nullable(),
      facultyId: z.string().uuid().nullable(),
    }),
  )
  .handler(async ({ data, context }) => {
    if (!context.user.roles.includes("admin"))
      throw new Error("Only authorized administrators can save student records.");
    await withTransaction(async (db) => {
      const existing = await db.query("SELECT 1 FROM student_records WHERE id = $1", [
        data.student.id,
      ]);
      await db.query(
        `INSERT INTO student_records(id, owner_id, faculty_id, record) VALUES($1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE SET owner_id = EXCLUDED.owner_id, faculty_id = EXCLUDED.faculty_id, record = EXCLUDED.record, updated_at = now()`,
        [data.student.id, data.ownerId, data.facultyId, JSON.stringify(data.student)],
      );
      await db.query("INSERT INTO campus_audit(actor_id, record_id, operation) VALUES($1,$2,$3)", [
        context.user.id,
        data.student.id,
        existing.rowCount ? "UPDATE" : "INSERT",
      ]);
    });
    return { saved: true };
  });
export const saveCampusIntervention = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      studentId: z.string().min(1),
      reason: z.string().trim().min(5).max(1000),
      action: z.string().trim().min(5).max(1000),
      priority: z.enum(["low", "medium", "high"]),
      owner: z.string().trim().min(1).max(100),
      followUpDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  )
  .handler(async ({ data, context }) => {
    const { user } = context;
    const [isFaculty, isAdmin] = flags(user.roles);
    // Only admins, or faculty assigned to this student, may create support actions.
    const result = await query(
      `INSERT INTO campus_interventions(student_id, created_by, reason, action, priority, owner, follow_up_date)
     SELECT sr.id, $1, $4, $5, $6, $7, $8 FROM student_records sr
      WHERE sr.id = $9 AND ($3::boolean OR ($2::boolean AND sr.faculty_id = $1))`,
      [
        user.id,
        isFaculty,
        isAdmin,
        data.reason,
        data.action,
        data.priority,
        data.owner,
        data.followUpDate,
        data.studentId,
      ],
    );
    if (!result.rowCount)
      throw new Error("You are not authorized to add support actions for this student.");
    return { saved: true };
  });
export const changeCampusIntervention = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      id: z.string().uuid(),
      status: z.enum(["open", "in-progress", "resolved"]),
      outcome: z.string().max(2000),
    }),
  )
  .handler(async ({ data, context }) => {
    const { user } = context;
    const [isFaculty, isAdmin] = flags(user.roles);
    // Admins may update any intervention; faculty only their own, for students assigned to them.
    const result = await query(
      `UPDATE campus_interventions ci SET status = $4, outcome = $5
      WHERE ci.id = $6 AND ($3::boolean OR ($2::boolean AND ci.created_by = $1
            AND EXISTS (SELECT 1 FROM student_records sr WHERE sr.id = ci.student_id AND sr.faculty_id = $1)))`,
      [user.id, isFaculty, isAdmin, data.status, data.outcome, data.id],
    );
    if (!result.rowCount) throw new Error("This intervention is not available for you to update.");
    return { saved: true };
  });

const requireAdmin = (user) => {
  if (!user.roles.includes("admin")) throw new Error("Only administrators can do this.");
};

// Lets an admin pick people by name/email instead of copying account identifiers.
export const listAccounts = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    requireAdmin(context.user);
    const { rows } = await query(
      `SELECT u.id, u.email, u.display_name,
              COALESCE(array_agg(r.role::text) FILTER (WHERE r.role IS NOT NULL), ARRAY[]::text[]) AS roles
         FROM users u LEFT JOIN user_roles r ON r.user_id = u.id
        GROUP BY u.id ORDER BY u.email`,
    );
    return rows.map((r) => ({ id: r.id, email: r.email, name: r.display_name, roles: r.roles }));
  });

export const setAccountRole = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      userId: z.string().uuid(),
      role: z.enum(["faculty", "admin"]),
      grant: z.boolean(),
    }),
  )
  .handler(async ({ data, context }) => {
    requireAdmin(context.user);
    if (data.grant) {
      await query("INSERT INTO user_roles(user_id, role) VALUES($1,$2) ON CONFLICT DO NOTHING", [
        data.userId,
        data.role,
      ]);
    } else {
      // Never let the last administrator (or yourself) be locked out.
      if (data.role === "admin" && data.userId === context.user.id) {
        throw new Error("You cannot remove your own administrator access.");
      }
      await query("DELETE FROM user_roles WHERE user_id = $1 AND role = $2", [
        data.userId,
        data.role,
      ]);
    }
    return { saved: true };
  });

// "Forgot your password?": an administrator sets a temporary password and hands it over privately.
// It is shown once here and never stored in readable form. The person changes it after signing in.
export const resetAccountPassword = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ userId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    requireAdmin(context.user);
    limitByIp("reset", 30, 60 * 60 * 1000);
    const temporary = randomBytes(9).toString("base64url");
    const result = await query("UPDATE users SET password_hash = $1 WHERE id = $2", [
      await hashPassword(temporary),
      data.userId,
    ]);
    if (!result.rowCount) throw new Error("That account no longer exists.");
    await query(
      "INSERT INTO campus_audit(actor_id, record_id, operation) VALUES($1,$2,'PASSWORD')",
      [context.user.id, data.userId],
    );
    return { password: temporary };
  });

// Connects student accounts to a teacher account using only their identities.
// Students without a record get an empty placeholder (details can be added later), so the
// teacher sees them straight away. facultyId = null disconnects them instead. The teacher must
// already have the faculty role, and teachers/administrators are never treated as students.
export const linkStudentsToTeacher = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      facultyId: z.string().uuid().nullable(),
      studentUserIds: z.array(z.string().uuid()).min(1).max(500),
    }),
  )
  .handler(async ({ data, context }) => {
    requireAdmin(context.user);
    const { facultyId } = data;
    return withTransaction(async (db) => {
      // Only plain student accounts can be assigned; teachers and administrators never are.
      const eligible = await db.query(
        `SELECT u.id FROM users u WHERE u.id = ANY($1::uuid[])
            AND NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role IN ('faculty','admin'))`,
        [[...new Set(data.studentUserIds)]],
      );
      const studentIds = eligible.rows.map((r) => r.id);
      if (!studentIds.length)
        throw new Error(
          "Choose at least one student account. Teachers and administrators cannot be assigned as students.",
        );
      if (facultyId) {
        const teacher = await db.query(
          "SELECT 1 FROM user_roles WHERE user_id = $1 AND role = 'faculty'",
          [facultyId],
        );
        if (!teacher.rowCount) {
          throw new Error(
            "That account is not a teacher. Give them teacher access in People & roles first.",
          );
        }
      }
      const updated = await db.query(
        "UPDATE student_records SET faculty_id = $1, updated_at = now() WHERE owner_id = ANY($2::uuid[]) RETURNING id",
        [facultyId, studentIds],
      );
      for (const r of updated.rows) {
        await db.query(
          "INSERT INTO campus_audit(actor_id, record_id, operation) VALUES($1,$2,'LINK')",
          [context.user.id, r.id],
        );
      }
      let created = 0;
      if (facultyId) {
        const missing = await db.query(
          `SELECT u.id, u.email, u.display_name FROM users u
            WHERE u.id = ANY($1::uuid[]) AND NOT EXISTS (SELECT 1 FROM student_records s WHERE s.owner_id = u.id)`,
          [studentIds],
        );
        for (const u of missing.rows) {
          const recordId = `ACC-${u.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
          const student = studentSchema.parse({
            ...emptyStudent,
            id: recordId,
            name: u.display_name?.trim() || u.email.split("@")[0],
          });
          await db.query(
            "INSERT INTO student_records(id, owner_id, faculty_id, record) VALUES($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING",
            [recordId, u.id, facultyId, JSON.stringify(student)],
          );
          await db.query(
            "INSERT INTO campus_audit(actor_id, record_id, operation) VALUES($1,$2,'INSERT')",
            [context.user.id, recordId],
          );
          created += 1;
        }
      }
      return { linked: updated.rowCount + created, created };
    });
  });

// Teachers keep the marks, attendance and skills of the students assigned to them up to date.
// Administrators can do this for anyone. Identity (ID, name), the account link, the teacher link and
// the notes stay as they are; those have their own, stricter paths.
export const saveStudentAcademics = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ student: studentSchema }))
  .handler(async ({ data, context }) => {
    const { user } = context;
    const [isFaculty, isAdmin] = flags(user.roles);
    if (!isFaculty && !isAdmin) throw new Error("Only teachers and administrators can do this.");
    limitByIp("academics", 120, 60 * 60 * 1000);
    await withTransaction(async (db) => {
      const current = await db.query(
        `SELECT sr.record FROM student_records sr
          WHERE sr.id = $1 AND ($3::boolean OR ($2::boolean AND sr.faculty_id = $4)) FOR UPDATE`,
        [data.student.id, isFaculty, isAdmin, user.id],
      );
      if (!current.rowCount) throw new Error("You can only update students assigned to you.");
      const old = current.rows[0].record;
      const next = studentSchema.parse({
        ...data.student,
        id: old.id,
        name: old.name,
        facultyFeedback: old.facultyFeedback ?? [],
        studentFeedback: old.studentFeedback ?? [],
        targetRoles: old.targetRoles ?? [],
      });
      await db.query("UPDATE student_records SET record = $2, updated_at = now() WHERE id = $1", [
        old.id,
        JSON.stringify(next),
      ]);
      await db.query(
        "INSERT INTO campus_audit(actor_id, record_id, operation) VALUES($1,$2,'UPDATE')",
        [user.id, old.id],
      );
    });
    return { saved: true };
  });

// Removes an account. Never your own, and never the last administrator.
export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ userId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    requireAdmin(context.user);
    if (data.userId === context.user.id) throw new Error("You cannot delete your own account.");
    const target = await query(
      `SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = $1 AND role = 'admin') AS is_admin,
              (SELECT count(*)::int FROM user_roles WHERE role = 'admin') AS admins`,
      [data.userId],
    );
    if (target.rows[0].is_admin && target.rows[0].admins <= 1)
      throw new Error("That is the last administrator, so it cannot be deleted.");
    try {
      const result = await query("DELETE FROM users WHERE id = $1", [data.userId]);
      if (!result.rowCount) throw new Error("That account no longer exists.");
    } catch (error) {
      // 23503: the person recorded support actions, which must stay on file.
      if (error?.code === "23503")
        throw new Error(
          "This person has recorded support actions, so the account is kept. Remove their teacher or administrator access instead.",
        );
      throw error;
    }
    await query("INSERT INTO campus_audit(actor_id, record_id, operation) VALUES($1,$2,'DELETE')", [
      context.user.id,
      data.userId,
    ]);
    return { saved: true };
  });

const MAX_NOTES = 100;
const noteText = z.string().trim().min(5, "Write at least 5 characters.").max(1000);

// Feedback is stored inside the student's record (facultyFeedback / studentFeedback).
// Teachers may only write about students assigned to them; students only on their own record.
export const addStudentNote = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("faculty"), recordId: z.string().min(1), note: noteText }),
      z.object({
        kind: z.literal("student"),
        recordId: z.string().min(1),
        note: noteText,
        about: z.string().trim().min(1).max(100).default("General"),
      }),
    ]),
  )
  .handler(async ({ data, context }) => {
    limitByIp("note", 30, 60 * 60 * 1000);
    const { user } = context;
    const [isFaculty, isAdmin] = flags(user.roles);
    const today = new Date().toISOString().slice(0, 10);
    const key = data.kind === "faculty" ? "facultyFeedback" : "studentFeedback";
    const entry =
      data.kind === "faculty"
        ? { from: user.displayName || user.email, note: data.note, date: today }
        : { about: data.about, note: data.note, date: today };
    // The WHERE clause is the permission check. Parameters: $1 user, $2 field, $3 entry, $4 record.
    const params = [user.id, key, JSON.stringify([entry]), data.recordId];
    let allowed = "sr.owner_id = $1";
    if (data.kind === "faculty") {
      params.push(isFaculty, isAdmin);
      allowed = "($6::boolean OR ($5::boolean AND sr.faculty_id = $1))";
    }
    const result = await query(
      `UPDATE student_records sr
          SET record = jsonb_set(record, ARRAY[$2::text], COALESCE(record->$2::text, '[]'::jsonb) || $3::jsonb),
              updated_at = now()
        WHERE sr.id = $4 AND ${allowed}
          AND jsonb_array_length(COALESCE(record->$2::text, '[]'::jsonb)) < ${MAX_NOTES}
        RETURNING sr.id`,
      params,
    );
    if (!result.rowCount) {
      throw new Error(
        data.kind === "faculty"
          ? "You can only add feedback for students assigned to you."
          : "You can only add feedback to your own record (or its limit was reached).",
      );
    }
    await query("INSERT INTO campus_audit(actor_id, record_id, operation) VALUES($1,$2,'NOTE')", [
      user.id,
      data.recordId,
    ]);
    return { saved: true };
  });

// Messages sent from the Contact page (and any concerns students raise there).
export const listContactMessages = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    requireAdmin(context.user);
    const { rows } = await query(
      "SELECT id, name, email, message, created_at FROM contact_messages ORDER BY created_at DESC LIMIT 200",
    );
    return rows.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() }));
  });

const httpsUrl = z
  .string()
  .trim()
  .max(200)
  .refine((v) => v === "" || /^https:\/\/\S+$/.test(v), "Links must start with https://");

// Everything a person may change about themselves. Marks, attendance, teacher links and other
// academic data stay with teachers and administrators.
export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      displayName: z.string().trim().min(1, "Name is required.").max(100),
      phone: z.string().trim().max(30),
      address: z.string().trim().max(300),
      bio: z.string().trim().max(600),
      linkedin: httpsUrl,
      github: httpsUrl,
      targetRoles: z.array(z.string().trim().min(1).max(50)).max(5),
    }),
  )
  .handler(async ({ data, context }) => {
    limitByIp("profile", 30, 60 * 60 * 1000);
    await withTransaction(async (db) => {
      await db.query(
        "UPDATE users SET display_name=$2, phone=$3, address=$4, bio=$5, linkedin_url=$6, github_url=$7 WHERE id=$1",
        [
          context.user.id,
          data.displayName,
          data.phone,
          data.address,
          data.bio,
          data.linkedin,
          data.github,
        ],
      );
      // Keep the student's own record in step: their name, and the roles they are aiming for.
      await db.query(
        `UPDATE student_records
            SET record = jsonb_set(jsonb_set(record, '{name}', to_jsonb($2::text)), '{targetRoles}', $3::jsonb),
                updated_at = now()
          WHERE owner_id = $1`,
        [context.user.id, data.displayName, JSON.stringify(data.targetRoles)],
      );
    });
    return { saved: true };
  });

/** The roles a student is aiming for, edited from the placement portal. */
export const updateTargetRoles = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ targetRoles: z.array(z.string().trim().min(1).max(50)).max(5) }))
  .handler(async ({ data, context }) => {
    limitByIp("profile", 30, 60 * 60 * 1000);
    const changed = await withTransaction(async (db) => {
      const { rowCount } = await db.query(
        `UPDATE student_records
            SET record = jsonb_set(record, '{targetRoles}', $2::jsonb), updated_at = now()
          WHERE owner_id = $1`,
        [context.user.id, JSON.stringify(data.targetRoles)],
      );
      return rowCount;
    });
    if (!changed) throw new Error("No student record is linked to your account yet.");
    return { saved: true };
  });

export const loadCohortStanding = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(({ context }) => withTransaction((db) => cohortStanding(db, context.user)));

export const listAudit = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    requireAdmin(context.user);
    const { rows } = await query(
      `SELECT a.id, a.operation, a.record_id, a.created_at, u.email AS actor_email
         FROM campus_audit a LEFT JOIN users u ON u.id = a.actor_id
        ORDER BY a.created_at DESC LIMIT 200`,
    );
    return rows.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() }));
  });
