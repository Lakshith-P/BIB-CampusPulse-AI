import { isAdmin, isFaculty, notify } from "./access.server.js";
import { liveNotifications } from "@/lib/live-profile";
import { academicRisk, effectiveBand, placementRisk } from "@/lib/risk-flags";
import { successScore } from "@/lib/scoring";
import { studentSchema } from "@/lib/student-validation";

const PRIORITY = { danger: "high", warning: "medium", info: "low" };
const MAX_STAFF_ALERTS = 25;

/**
 * Turns the rules (attendance, deadlines, marks, backlogs, risk bands, follow-ups) into stored
 * notifications for the caller. A stable key per situation means each is stored once, however
 * often this runs, and it is gone from "unread" only when the person reads it.
 */
export async function syncNotifications(db, user, today) {
  const own = await db.query("SELECT id, record FROM student_records WHERE owner_id = $1", [
    user.id,
  ]);
  for (const row of own.rows) {
    const parsed = studentSchema.safeParse(row.record);
    if (!parsed.success) continue;
    for (const n of liveNotifications(parsed.data, today)) {
      if (n.tone === "info") continue;
      await notify(db, user.id, {
        area: n.area,
        priority: PRIORITY[n.tone],
        title: n.text,
        body: n.tip,
        link: LINKS[n.area] ?? "/portal",
        key: `live:${row.id}:${n.key}`,
      });
    }
  }
  if (isFaculty(user) || isAdmin(user)) await staffAlerts(db, user, today);
  await db.query(
    "DELETE FROM notifications WHERE user_id = $1 AND created_at < now() - interval '120 days'",
    [user.id],
  );
}

const LINKS = {
  Attendance: "/portal/attendance",
  Assignment: "/portal/lms",
  Academics: "/portal/results",
  Skills: "/portal/skills",
  Engagement: "/portal/engagement",
};

async function staffAlerts(db, user, today) {
  const { rows } = await db.query(
    "SELECT id, record FROM student_records WHERE ($2::boolean OR faculty_id = $1) ORDER BY id",
    [user.id, isAdmin(user)],
  );
  let sent = 0;
  for (const row of rows) {
    if (sent >= MAX_STAFF_ALERTS) break;
    const parsed = studentSchema.safeParse(row.record);
    if (!parsed.success) continue;
    const s = parsed.data;
    const r = successScore(s);
    if (r.score === null) continue;
    const band = effectiveBand(r.score, r.band, academicRisk(s), placementRisk(s));
    if (band !== "High Priority") continue;
    sent += 1;
    await notify(db, user.id, {
      area: "Risk",
      priority: "high",
      title: `${s.name} is High Priority (score ${Math.round(r.score)})`,
      body: r.negatives.slice(0, 3).join("; ") || "Open the profile to see the reasons.",
      link: `/portal/students/${encodeURIComponent(s.id)}`,
      key: `risk:${s.id}:${band}`,
    });
  }
  const due = await db.query(
    `SELECT ci.id, ci.student_id, ci.follow_up_date::text AS follow_up_date
       FROM campus_interventions ci JOIN student_records sr ON sr.id = ci.student_id
      WHERE ci.status <> 'resolved' AND ci.follow_up_date < $4::date
        AND ($3::boolean OR sr.faculty_id = $1 OR ci.created_by = $1)
      ORDER BY ci.follow_up_date LIMIT 25`,
    [user.id, isFaculty(user), isAdmin(user), today],
  );
  for (const i of due.rows)
    await notify(db, user.id, {
      area: "Support",
      priority: "medium",
      title: `Follow-up overdue for student ${i.student_id}`,
      body: `Planned for ${i.follow_up_date}.`,
      link: "/portal/interventions",
      key: `followup:${i.id}`,
    });
}

export async function listNotifications(db, user, { limit = 100 } = {}) {
  const { rows } = await db.query(
    `SELECT id, area, priority, title, body, link, read_at, created_at
       FROM notifications WHERE user_id = $1
      ORDER BY (read_at IS NULL) DESC, created_at DESC LIMIT $2`,
    [user.id, limit],
  );
  const unread = await db.query(
    "SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL",
    [user.id],
  );
  return {
    unread: unread.rows[0].n,
    items: rows.map((r) => ({
      ...r,
      read_at: r.read_at ? new Date(r.read_at).toISOString() : null,
      created_at: new Date(r.created_at).toISOString(),
    })),
  };
}

export async function setRead(db, user, { ids, read }) {
  const result = await db.query(
    `UPDATE notifications SET read_at = CASE WHEN $3::boolean THEN COALESCE(read_at, now()) ELSE NULL END
      WHERE user_id = $1 AND ($2::uuid[] IS NULL OR id = ANY($2::uuid[]))`,
    [user.id, ids ?? null, read],
  );
  return { changed: result.rowCount };
}
