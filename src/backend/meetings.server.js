import { isAdmin, isFaculty, notify, requireOwnStudent, requireStaff } from "./access.server.js";

// Mentor meetings: a student asks their assigned mentor for a slot, the mentor confirms or
// declines it (with an optional note) and can later mark it completed. A student only ever sees
// their own meetings and a teacher only the meetings booked with them; administrators see all.

const MAX_OPEN = 3; // requests or confirmed meetings a student may have waiting at once
const MAX_DAYS_AHEAD = 60;
const OPEN = ["requested", "confirmed"];

const view = (r) => ({
  id: r.id,
  studentId: r.student_id,
  studentName: r.student_name ?? null,
  mentorId: r.mentor_id,
  mentorName: r.mentor_name ?? null,
  slotAt: new Date(r.slot_at).toISOString(),
  durationMin: r.duration_min,
  mode: r.mode,
  topic: r.topic,
  status: r.status,
  mentorNote: r.mentor_note,
});

const SELECT = `
  SELECT m.*, sr.record->>'name' AS student_name,
         coalesce(u.display_name, u.email) AS mentor_name
    FROM mentor_meetings m
    JOIN student_records sr ON sr.id = m.student_id
    LEFT JOIN users u ON u.id = m.mentor_id`;

const when = (iso) =>
  new Date(iso).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });

/** A student asks their mentor for a meeting slot. */
export async function requestMeeting(
  db,
  user,
  { slotAt, durationMin, mode, topic },
  now = new Date(),
) {
  const own = await requireOwnStudent(db, user);
  if (!own.faculty_id) throw new Error("You do not have a mentor yet, so there is no one to meet.");
  const start = new Date(slotAt);
  if (Number.isNaN(start.getTime())) throw new Error("Choose a valid date and time.");
  if (start <= now) throw new Error("Choose a time in the future.");
  if (start - now > MAX_DAYS_AHEAD * 86_400_000)
    throw new Error(`Choose a time within the next ${MAX_DAYS_AHEAD} days.`);

  const { rows: open } = await db.query(
    "SELECT count(*)::int AS n FROM mentor_meetings WHERE student_id = $1 AND status = ANY($2) AND slot_at > $3",
    [own.id, OPEN, now.toISOString()],
  );
  if (open[0].n >= MAX_OPEN)
    throw new Error(
      `You already have ${MAX_OPEN} upcoming meeting requests. Cancel one before asking for another.`,
    );

  // The mentor cannot be in two confirmed meetings at once.
  const end = new Date(start.getTime() + durationMin * 60_000);
  const clash = await db.query(
    `SELECT 1 FROM mentor_meetings
      WHERE mentor_id = $1 AND status = 'confirmed'
        AND slot_at < $3 AND slot_at + make_interval(mins => duration_min) > $2`,
    [own.faculty_id, start.toISOString(), end.toISOString()],
  );
  if (clash.rowCount) throw new Error("Your mentor already has a meeting then. Pick another time.");

  const { rows } = await db.query(
    `INSERT INTO mentor_meetings(student_id, mentor_id, requested_by, slot_at, duration_min, mode, topic)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [own.id, own.faculty_id, user.id, start.toISOString(), durationMin, mode, topic.trim()],
  );
  const name = own.record?.name || own.id;
  await notify(db, own.faculty_id, {
    area: "mentoring",
    priority: "medium",
    title: `${name} asked for a meeting`,
    body: `${when(start)} · ${durationMin} min · ${mode}. Topic: ${topic.trim().slice(0, 140)}`,
    link: "/portal/interventions",
    key: `meeting-request:${rows[0].id}`,
  });
  return { id: rows[0].id };
}

/** The caller's meetings: a student's own, a mentor's bookings, or everything for an administrator. */
export async function listMeetings(db, user) {
  if (isFaculty(user) || isAdmin(user)) {
    const { rows } = await db.query(
      `${SELECT} WHERE ($2::boolean OR m.mentor_id = $1) ORDER BY m.slot_at DESC LIMIT 100`,
      [user.id, isAdmin(user) && !isFaculty(user)],
    );
    return rows.map(view);
  }
  const own = await requireOwnStudent(db, user);
  const { rows } = await db.query(
    `${SELECT} WHERE m.student_id = $1 ORDER BY m.slot_at DESC LIMIT 50`,
    [own.id],
  );
  return rows.map(view);
}

const NEXT = {
  confirmed: ["requested"],
  declined: ["requested", "confirmed"],
  completed: ["confirmed"],
};

/** The mentor confirms, declines or completes a meeting booked with them. */
export async function respondMeeting(db, user, { id, decision, note = "" }) {
  requireStaff(user);
  const { rows } = await db.query(`${SELECT} WHERE m.id = $1 AND m.mentor_id = $2`, [id, user.id]);
  const m = rows[0];
  if (!m) throw new Error("That meeting is not one booked with you.");
  if (!NEXT[decision]?.includes(m.status))
    throw new Error(`A ${m.status} meeting cannot be marked ${decision}.`);
  if (decision === "confirmed") {
    const clash = await db.query(
      `SELECT 1 FROM mentor_meetings
        WHERE mentor_id = $1 AND status = 'confirmed' AND id <> $2
          AND slot_at < $3::timestamptz + make_interval(mins => $4)
          AND slot_at + make_interval(mins => duration_min) > $3::timestamptz`,
      [user.id, id, m.slot_at, m.duration_min],
    );
    if (clash.rowCount) throw new Error("You already have a confirmed meeting at that time.");
  }
  await db.query(
    "UPDATE mentor_meetings SET status = $2, mentor_note = $3, updated_at = now() WHERE id = $1",
    [id, decision, note.trim().slice(0, 500)],
  );
  const owner = (
    await db.query("SELECT owner_id FROM student_records WHERE id = $1", [m.student_id])
  ).rows[0]?.owner_id;
  const verb = { confirmed: "confirmed", declined: "declined", completed: "marked as completed" }[
    decision
  ];
  await notify(db, owner, {
    area: "mentoring",
    priority: decision === "declined" ? "medium" : "low",
    title: `Your mentor ${verb} the meeting on ${when(m.slot_at)}`,
    body: note.trim() ? `Note from your mentor: ${note.trim().slice(0, 200)}` : "",
    link: "/portal",
    key: `meeting-${decision}:${id}`,
  });
  return { saved: true };
}

/** A student cancels one of their own upcoming meetings. */
export async function cancelMeeting(db, user, { id }) {
  const own = await requireOwnStudent(db, user);
  const { rows } = await db.query(
    `UPDATE mentor_meetings SET status = 'cancelled', updated_at = now()
      WHERE id = $1 AND student_id = $2 AND status = ANY($3)
      RETURNING mentor_id, slot_at`,
    [id, own.id, OPEN],
  );
  if (!rows[0]) throw new Error("That meeting cannot be cancelled.");
  await notify(db, rows[0].mentor_id, {
    area: "mentoring",
    priority: "low",
    title: `${own.record?.name || own.id} cancelled the meeting on ${when(rows[0].slot_at)}`,
    body: "",
    link: "/portal/interventions",
    key: `meeting-cancelled:${id}`,
  });
  return { cancelled: true };
}
