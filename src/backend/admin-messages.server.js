import { randomUUID } from "node:crypto";
import { requireAdminUser } from "./access.server.js";

// Messages an administrator posts from the Messages page. They reach people as notifications (the
// bell), and what was sent is kept so the administrator can see it. Administrators only.

const AUDIENCES = ["students", "teachers", "everyone", "person"];

/**
 * Posts a message to all students, all teachers, everyone, or one person. Everyone it reaches gets a
 * notification; the administrator who wrote it is never counted among the recipients.
 */
export async function postAdminMessage(db, admin, { audience, userId, subject = "", body }) {
  requireAdminUser(admin);
  const text = (body ?? "").trim();
  if (!text) throw new Error("Write a message first.");
  if (!AUDIENCES.includes(audience)) throw new Error("Choose who the message is for.");

  let recipients;
  let label;
  if (audience === "person") {
    if (!userId) throw new Error("Choose the person to write to.");
    const found = await db.query(
      "SELECT id, coalesce(nullif(display_name, ''), email) AS name FROM users WHERE id = $1",
      [userId],
    );
    if (!found.rowCount) throw new Error("That person was not found.");
    recipients = [found.rows[0].id];
    label = found.rows[0].name;
  } else {
    const roles =
      audience === "students" ? ["student"] : audience === "teachers" ? ["faculty"] : null;
    const found = await db.query(
      `SELECT DISTINCT u.id FROM users u
         LEFT JOIN user_roles r ON r.user_id = u.id
        WHERE u.id <> $1 AND ($2::text[] IS NULL OR r.role::text = ANY($2::text[]))`,
      [admin.id, roles],
    );
    recipients = found.rows.map((r) => r.id);
    label = { students: "All students", teachers: "All teachers", everyone: "Everyone" }[audience];
  }
  if (!recipients.length) throw new Error("There is nobody to send this to yet.");

  const sender = admin.displayName || admin.email;
  const title = subject.trim() || `Message from ${sender}`;
  const id = randomUUID();
  await db.query(
    `INSERT INTO notifications(user_id, area, priority, title, body, link, dedupe_key)
     SELECT u, 'Administrator', 'high', $2, $3, '/portal/notifications', $4 FROM unnest($1::uuid[]) AS u
     ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
    [recipients, title, text.slice(0, 600), `admin-message:${id}`],
  );
  await db.query(
    `INSERT INTO admin_messages(id, sender_id, audience, recipient_id, recipient_label, subject, body, recipients)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      id,
      admin.id,
      audience,
      audience === "person" ? recipients[0] : null,
      label,
      subject.trim(),
      text,
      recipients.length,
    ],
  );
  return { sent: recipients.length, to: label };
}

/** What administrators have posted, newest first. */
export async function listAdminMessages(db, admin) {
  requireAdminUser(admin);
  const { rows } = await db.query(
    `SELECT m.id, m.audience, m.recipient_label, m.subject, m.body, m.recipients, m.created_at,
            coalesce(nullif(u.display_name, ''), u.email::text, 'Former administrator') AS sender
       FROM admin_messages m LEFT JOIN users u ON u.id = m.sender_id
      ORDER BY m.created_at DESC LIMIT 50`,
  );
  return rows.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() }));
}
