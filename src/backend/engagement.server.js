import {
  isAdmin,
  isStaff,
  notify,
  ownStudent,
  requireOwnStudent,
  requireStaff,
  staffStudent,
} from "./access.server.js";

export const OPPORTUNITY_TYPES = ["event", "club", "hackathon", "certification"];

const SELECT = `o.id, o.type, o.title, o.purpose, o.benefits, o.requirements, o.eligibility,
  o.how_to_apply, o.deadline::text AS deadline, o.link`;

export async function listOpportunities(db, user, today) {
  const { rows } = await db.query(
    `SELECT ${SELECT} FROM opportunities o ORDER BY (o.deadline IS NULL OR o.deadline >= $1::date) DESC, o.deadline NULLS LAST, o.created_at DESC`,
    [today],
  );
  const open = (r) => !r.deadline || r.deadline >= today;
  if (isStaff(user)) {
    const counts = await db.query(
      `SELECT opportunity_id, count(*)::int AS participants,
              count(*) FILTER (WHERE status = 'completed' AND NOT verified)::int AS to_verify
         FROM opportunity_participation GROUP BY opportunity_id`,
    );
    const by = new Map(counts.rows.map((c) => [c.opportunity_id, c]));
    return rows.map((r) => ({
      ...r,
      open: open(r),
      stats: by.get(r.id) ?? { participants: 0, to_verify: 0 },
    }));
  }
  const own = await ownStudent(db, user);
  const mine = own
    ? await db.query(
        "SELECT opportunity_id, status, evidence, verified FROM opportunity_participation WHERE student_id = $1",
        [own.id],
      )
    : { rows: [] };
  const by = new Map(mine.rows.map((m) => [m.opportunity_id, m]));
  return rows.map((r) => ({ ...r, open: open(r), participation: by.get(r.id) ?? null }));
}

export async function saveOpportunity(db, user, data, today) {
  requireStaff(user);
  const { rows } = await db.query(
    `INSERT INTO opportunities(type, title, purpose, benefits, requirements, eligibility, how_to_apply, deadline, link, created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,NULLIF($8,'')::date,$9,$10) RETURNING id`,
    [
      data.type,
      data.title,
      data.purpose,
      data.benefits,
      data.requirements,
      data.eligibility,
      data.howToApply,
      data.deadline,
      data.link,
      user.id,
    ],
  );
  const id = rows[0].id;
  const students = await db.query(
    "SELECT DISTINCT owner_id FROM student_records WHERE owner_id IS NOT NULL",
  );
  if (!data.deadline || data.deadline >= today)
    for (const s of students.rows)
      await notify(db, s.owner_id, {
        area: "Engagement",
        priority: "low",
        title: `New ${data.type}: ${data.title}`,
        body: data.deadline ? `Apply by ${data.deadline}.` : "",
        link: "/portal/engagement",
        key: `opportunity:${id}`,
      });
  return { saved: true, id };
}

export async function deleteOpportunity(db, user, { id }) {
  requireStaff(user);
  const result = await db.query(
    "DELETE FROM opportunities WHERE id = $1 AND ($2::boolean OR created_by = $3)",
    [id, isAdmin(user), user.id],
  );
  if (!result.rowCount) throw new Error("You cannot remove this opportunity.");
  return { saved: true };
}

/** A student records where they stand: interested, applied, taking part, or completed. */
export async function setParticipation(db, user, { opportunityId, status, evidence }) {
  const own = await requireOwnStudent(db, user);
  const o = await db.query("SELECT 1 FROM opportunities WHERE id = $1", [opportunityId]);
  if (!o.rowCount) throw new Error("That opportunity no longer exists.");
  // Changing the status away from "completed" withdraws any earlier verification.
  await db.query(
    `INSERT INTO opportunity_participation(opportunity_id, student_id, status, evidence)
     VALUES($1,$2,$3,$4)
     ON CONFLICT (opportunity_id, student_id) DO UPDATE
       SET status = EXCLUDED.status, evidence = EXCLUDED.evidence, updated_at = now(),
           verified = CASE WHEN EXCLUDED.status = 'completed' THEN opportunity_participation.verified ELSE false END`,
    [opportunityId, own.id, status, evidence],
  );
  if (status !== "completed") await removeEngagementEntry(db, own.id, opportunityId);
  if (status === "completed" && own.faculty_id)
    await notify(db, own.faculty_id, {
      area: "Engagement",
      priority: "low",
      title: `${own.record.name} completed an activity and needs verification`,
      link: "/portal/engagement",
      key: `verify:${opportunityId}:${own.id}`,
    });
  return { saved: true };
}

export async function listParticipants(db, user, { opportunityId }) {
  requireStaff(user);
  const { rows } = await db.query(
    `SELECT p.student_id, p.status, p.evidence, p.verified, sr.record->>'name' AS name
       FROM opportunity_participation p JOIN student_records sr ON sr.id = p.student_id
      WHERE p.opportunity_id = $1 AND ($3::boolean OR sr.faculty_id = $2)
      ORDER BY name`,
    [opportunityId, user.id, isAdmin(user)],
  );
  return rows;
}

async function removeEngagementEntry(db, studentId, opportunityId) {
  const { rows } = await db.query("SELECT type, title FROM opportunities WHERE id = $1", [
    opportunityId,
  ]);
  if (!rows[0]) return;
  await db.query(
    `UPDATE student_records
        SET record = jsonb_set(record, '{engagement}',
              COALESCE((SELECT jsonb_agg(e) FROM jsonb_array_elements(record->'engagement') e
                         WHERE NOT (e->>'name' = $2 AND e->>'type' = $3)), '[]'::jsonb)),
            updated_at = now()
      WHERE id = $1`,
    [studentId, rows[0].title, rows[0].type],
  );
}

/** A teacher confirms a completed activity; it then counts towards the engagement score. */
export async function verifyParticipation(db, user, { opportunityId, studentId, verified }, today) {
  const student = await staffStudent(db, user, studentId);
  const p = await db.query(
    "SELECT status, evidence FROM opportunity_participation WHERE opportunity_id = $1 AND student_id = $2",
    [opportunityId, studentId],
  );
  if (!p.rows[0] || p.rows[0].status !== "completed")
    throw new Error("Only completed activities can be verified.");
  const o = await db.query("SELECT type, title FROM opportunities WHERE id = $1", [opportunityId]);
  await db.query(
    `UPDATE opportunity_participation SET verified = $3, verified_by = $4, updated_at = now()
      WHERE opportunity_id = $1 AND student_id = $2`,
    [opportunityId, studentId, verified, user.id],
  );
  await removeEngagementEntry(db, studentId, opportunityId);
  if (verified) {
    const entry = {
      type: o.rows[0].type,
      name: o.rows[0].title,
      date: today,
      verified: true,
      evidence: p.rows[0].evidence || undefined,
    };
    await db.query(
      `UPDATE student_records
          SET record = jsonb_set(jsonb_set(record, '{engagement}',
                COALESCE(record->'engagement', '[]'::jsonb) || $2::jsonb), '{hasEngagementData}', 'true'::jsonb),
              updated_at = now()
        WHERE id = $1`,
      [studentId, JSON.stringify([entry])],
    );
  }
  await notify(db, student.owner_id, {
    area: "Engagement",
    priority: "low",
    title: verified ? `Verified: ${o.rows[0].title}` : `Verification removed: ${o.rows[0].title}`,
    link: "/portal/engagement",
    key: `verified:${opportunityId}:${studentId}:${verified}`,
  });
  return { saved: true };
}
