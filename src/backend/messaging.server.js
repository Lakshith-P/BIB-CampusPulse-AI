import { isAdmin, isFaculty, ownStudent } from "./access.server.js";

const sectionKey = (record) =>
  [record.branch, record.semester, record.section, record.gradYear].map((v) => v ?? "").join("|");
const SECTION_KEY_SQL = `concat_ws('|',
  coalesce(sr.record->>'branch', ''),
  coalesce(sr.record->>'semester', ''),
  coalesce(sr.record->>'section', ''),
  coalesce(sr.record->>'gradYear', '')
)`;

function requireChatRole(user) {
  if (!user.roles.some((role) => ["student", "faculty", "admin"].includes(role)))
    throw new Error("Your account cannot use dashboard chat.");
}

async function syncSectionRooms(db) {
  await db.query(
    `INSERT INTO chat_section_rooms(section_key, label)
     SELECT DISTINCT ${SECTION_KEY_SQL},
            concat_ws(' · ', nullif(sr.record->>'branch', ''),
              CASE WHEN nullif(sr.record->>'section', '') IS NOT NULL
                THEN 'Section ' || (sr.record->>'section') END,
              CASE WHEN nullif(sr.record->>'semester', '') IS NOT NULL
                THEN 'Semester ' || (sr.record->>'semester') END,
              CASE WHEN nullif(sr.record->>'gradYear', '') IS NOT NULL
                THEN 'Class of ' || (sr.record->>'gradYear') END)
       FROM student_records sr
      WHERE nullif(sr.record->>'section', '') IS NOT NULL
     ON CONFLICT (section_key) DO UPDATE SET label = EXCLUDED.label`,
  );
}

export async function loadChatOverview(db, user) {
  requireChatRole(user);
  await syncSectionRooms(db);
  const admin = isAdmin(user);
  let sectionRows;
  if (!admin && !isFaculty(user)) {
    const own = await ownStudent(db, user);
    sectionRows = own?.record.section
      ? (
          await db.query(`SELECT id, label FROM chat_section_rooms WHERE section_key = $1`, [
            sectionKey(own.record),
          ])
        ).rows
      : [];
  } else {
    sectionRows = (
      await db.query(
        `SELECT DISTINCT cr.id, cr.label
           FROM chat_section_rooms cr JOIN student_records sr
             ON ${SECTION_KEY_SQL} = cr.section_key
          WHERE $2::boolean OR sr.faculty_id = $1
          ORDER BY cr.label`,
        [user.id, admin],
      )
    ).rows;
  }
  const { rows: requests } = await db.query(
    `SELECT r.id, r.student_id, r.teacher_id, r.status, r.created_at, r.updated_at,
            sr.record->>'name' AS student_name,
            coalesce(t.display_name, t.email::text) AS teacher_name
       FROM private_chat_requests r
       JOIN student_records sr ON sr.id = r.student_id
       JOIN users t ON t.id = r.teacher_id
      WHERE $2::boolean OR sr.owner_id = $1 OR r.teacher_id = $1
      ORDER BY r.updated_at DESC`,
    [user.id, admin],
  );
  return {
    sections: sectionRows,
    requests: requests.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() })),
  };
}

export async function requestPrivateChat(db, user) {
  if (!user.roles.includes("student") || isFaculty(user) || isAdmin(user))
    throw new Error("Only students can request a private chat.");
  const own = await ownStudent(db, user);
  if (!own) throw new Error("No student record is linked to your account yet.");
  if (!own.faculty_id) throw new Error("A teacher must be assigned before you can request a chat.");
  const upsert = await db.query(
    `INSERT INTO private_chat_requests(student_id, teacher_id)
     VALUES($1, $2)
     ON CONFLICT (student_id, teacher_id) DO UPDATE
       SET status = 'pending', updated_at = now()
       WHERE private_chat_requests.status = 'rejected'
     RETURNING id, status`,
    [own.id, own.faculty_id],
  );
  if (upsert.rows[0]) return upsert.rows[0];
  const existing = (
    await db.query(
      "SELECT id, status FROM private_chat_requests WHERE student_id = $1 AND teacher_id = $2",
      [own.id, own.faculty_id],
    )
  ).rows[0];
  if (existing.status === "approved")
    throw new Error("Your private chat with your teacher is already active.");
  throw new Error("Your private chat request is already waiting for your teacher.");
}

export async function reviewPrivateChat(db, user, { requestId, decision }) {
  if (!isFaculty(user) && !isAdmin(user))
    throw new Error("Only the assigned teacher can review a private chat request.");
  const { rowCount } = await db.query(
    `UPDATE private_chat_requests r
        SET status = $3, updated_at = now()
       FROM student_records sr
      WHERE r.id = $1 AND sr.id = r.student_id AND r.status = 'pending'
        AND ($4::boolean OR (r.teacher_id = $2 AND sr.faculty_id = $2))`,
    [requestId, user.id, decision, isAdmin(user)],
  );
  if (!rowCount) throw new Error("That pending request is not assigned to you.");
  return { saved: true };
}

async function authorizeSectionRoom(db, user, roomId) {
  const { rows } = await db.query(
    `SELECT 1 FROM chat_section_rooms cr
      WHERE cr.id = $2 AND (
        $3::boolean OR EXISTS (
          SELECT 1 FROM student_records sr
           WHERE ${SECTION_KEY_SQL} = cr.section_key
             AND (sr.owner_id = $1 OR ($4::boolean AND sr.faculty_id = $1))
        )
      )`,
    [user.id, roomId, isAdmin(user), isFaculty(user)],
  );
  if (!rows.length) throw new Error("This section chat is not available to your account.");
}

async function authorizePrivateChat(db, user, requestId) {
  const { rows } = await db.query(
    `SELECT 1
       FROM private_chat_requests r JOIN student_records sr ON sr.id = r.student_id
      WHERE r.id = $2 AND r.status = 'approved'
        AND ($3::boolean OR sr.owner_id = $1 OR (r.teacher_id = $1 AND sr.faculty_id = $1))`,
    [user.id, requestId, isAdmin(user)],
  );
  if (!rows.length)
    throw new Error("This private chat is not approved or available to your account.");
}

export async function loadChatMessages(db, user, { type, id }) {
  requireChatRole(user);
  const table = type === "section" ? "chat_section_messages" : "private_chat_messages";
  if (type === "section") await authorizeSectionRoom(db, user, id);
  else if (type === "private") await authorizePrivateChat(db, user, id);
  else throw new Error("Choose a valid chat.");
  const { rows } = await db.query(
    `SELECT m.id, m.sender_id, coalesce(u.display_name, u.email::text, 'Former user') AS sender_name,
            m.body, m.created_at
       FROM ${table} m LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.${type === "section" ? "room_id" : "request_id"} = $1
      ORDER BY m.created_at DESC LIMIT 100`,
    [id],
  );
  return rows.reverse();
}

export async function sendChatMessage(db, user, { type, id, body }) {
  requireChatRole(user);
  if (type === "section") await authorizeSectionRoom(db, user, id);
  else if (type === "private") await authorizePrivateChat(db, user, id);
  else throw new Error("Choose a valid chat.");
  const table = type === "section" ? "chat_section_messages" : "private_chat_messages";
  const foreignKey = type === "section" ? "room_id" : "request_id";
  const { rows } = await db.query(
    `INSERT INTO ${table}(${foreignKey}, sender_id, body) VALUES($1, $2, $3)
     RETURNING id, sender_id, body, created_at`,
    [id, user.id, body.trim()],
  );
  return rows[0];
}
