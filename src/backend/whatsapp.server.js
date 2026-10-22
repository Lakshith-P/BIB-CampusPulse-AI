import { createHmac, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";

import { isAdmin, isFaculty, isStaff } from "./access.server.js";
import { loadTimetable } from "./attendance.server.js";
import { BAND_ORDER, buildRows, byAttention, isAtRisk } from "@/lib/campus-derive";

// A WhatsApp chat bot for students and teachers, reached through a Twilio webhook. People sign
// in inside the chat (email, then password); after that the bot answers from the same data and
// the same permission rules as the website: a student sees only their own record, a teacher
// only the students assigned to them, an administrator everyone.

const SESSION_HOURS = 8;
const STEP_MINUTES = 10;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const MAX_REPLY = 1500; // WhatsApp via Twilio allows 1600 characters per message
// Compared against when the email is unknown, so a wrong email costs the same time as a wrong password.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

// ------------------------------------------------------------------ Twilio plumbing
/** Twilio signs each webhook: base64 HMAC-SHA1 of the URL plus every sorted key and value. */
export function twilioSignature(authToken, url, params) {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  return createHmac("sha1", authToken).update(data).digest("base64");
}

export function validTwilioSignature(authToken, url, params, header) {
  if (!authToken || !header) return false;
  const a = Buffer.from(twilioSignature(authToken, url, params));
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

const xml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const twiml = (text) =>
  `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xml(text)}</Message></Response>`;

// ------------------------------------------------------------------ formatting
const pct = (v) => (v === null || v === undefined ? "—" : `${Math.round(v)}%`);
const bold = (s) => `*${s}*`;
const cap = (text) =>
  text.length > MAX_REPLY ? `${text.slice(0, MAX_REPLY - 20)}\n…(trimmed)` : text;
const DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STUDENT_HELP = [
  "• *score* – your Success Score and band",
  "• *attendance* – attendance by subject",
  "• *marks* – subject marks and CGPA",
  "• *timetable* – your weekly classes",
  "• *assignments* – work still to submit",
  "• *logout*",
];
const STAFF_HELP = [
  "• *students* – your students and their scores",
  "• *risk* – students who need attention",
  "• *low* – students under 75% attendance",
  "• *student S-101* – one student's details",
  "• *timetable* – weekly classes",
  "• *logout*",
];
const helpText = (user) =>
  [
    `Hi ${user.displayName || "there"}! You can ask me:`,
    ...(isStaff(user) ? STAFF_HELP : STUDENT_HELP),
  ].join("\n");

const WELCOME =
  "Welcome to BIB InsightIQ on WhatsApp.\nSend *login* to sign in with your portal email and password and see your details.";

function studentSummary(row) {
  return [
    `${bold(row.name)} (${row.id})`,
    `Success Score: ${row.score === null ? "not enough data yet" : `${Math.round(row.score)} – ${row.band}`}`,
    `Attendance: ${pct(row.attendance)} · CGPA: ${row.cgpa ?? "—"}`,
    `LMS completion: ${pct(row.lms)}`,
    row.riskDriver ? `Main concern: ${row.riskDriver}` : null,
    row.topDriver ? `Strongest area: ${row.topDriver}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

// ------------------------------------------------------------------ data
/** The students this account may see: its own, those assigned to it, or all as administrator. */
async function visibleRows(db, user, today) {
  const { rows } = await db.query(
    `SELECT sr.id, sr.owner_id, sr.faculty_id, sr.record FROM student_records sr
      WHERE sr.owner_id = $1 OR ($2::boolean AND sr.faculty_id = $1) OR $3::boolean
      ORDER BY sr.id`,
    [user.id, isFaculty(user), isAdmin(user)],
  );
  return buildRows(rows, today);
}

const ownRow = async (db, user, today) =>
  (await visibleRows(db, user, today)).find((r) => r.ownerId === user.id) ?? null;

async function timetableText(db, user) {
  const { slots } = await loadTimetable(db, user);
  if (!slots.length) return "No timetable has been published yet.";
  return slots
    .map((s) => `${DAYS[s.day]} ${s.start}–${s.end}  ${s.subject}${s.room ? ` (${s.room})` : ""}`)
    .join("\n");
}

// ------------------------------------------------------------------ commands
async function answerStudent(db, user, command, today) {
  const row = await ownRow(db, user, today);
  if (!row) return "No student record is linked to your account yet. Ask your teacher to link it.";
  const subjects = row.s.subjects;
  switch (command) {
    case "score":
    case "me":
      return studentSummary(row);
    case "attendance":
      return subjects.length
        ? [
            `${bold("Attendance")}: ${pct(row.attendance)} overall`,
            ...subjects.map((s) => {
              const p = s.classesHeld ? (s.classesAttended / s.classesHeld) * 100 : null;
              return `${p !== null && p < 75 ? "⚠️ " : ""}${s.subject}: ${pct(p)} (${s.classesAttended}/${s.classesHeld})`;
            }),
          ].join("\n")
        : "No attendance has been recorded yet.";
    case "marks":
    case "results":
      return subjects.length
        ? [
            `${bold("Marks")} · CGPA ${row.cgpa ?? "—"}`,
            ...subjects.map((s) => `${s.subject}: ${s.marks}`),
          ].join("\n")
        : "No marks have been recorded yet.";
    case "timetable":
      return `${bold("Your timetable")}\n${await timetableText(db, user)}`;
    case "assignments":
    case "due": {
      const { rows } = await db.query(
        `SELECT a.subject, a.unit, a.title, a.due_on::text AS due_on FROM lms_assignments a
          WHERE a.subject = ANY($1)
            AND NOT EXISTS (SELECT 1 FROM lms_submissions s WHERE s.assignment_id = a.id AND s.student_id = $2)
          ORDER BY a.due_on LIMIT 8`,
        [subjects.map((s) => s.subject), row.id],
      );
      return rows.length
        ? [
            bold("Assignments to submit"),
            ...rows.map(
              (a) =>
                `${a.due_on < today ? "⚠️ overdue " : ""}${a.subject} U${a.unit}: ${a.title} – due ${a.due_on}`,
            ),
          ].join("\n")
        : "You have no pending assignments. 🎉";
    }
    default:
      return null;
  }
}

async function answerStaff(db, user, command, arg, today) {
  const rows = await visibleRows(db, user, today);
  switch (command) {
    case "students": {
      if (!rows.length) return "No students are assigned to you yet.";
      const bands = BAND_ORDER.map((b) => `${b}: ${rows.filter((r) => r.band === b).length}`);
      return [
        `${bold(`${rows.length} students`)}`,
        ...bands,
        "",
        ...byAttention(rows)
          .slice(0, 8)
          .map((r) => `${r.id} ${r.name} – ${r.score === null ? "no score" : Math.round(r.score)}`),
      ].join("\n");
    }
    case "risk": {
      const risky = byAttention(rows).filter(isAtRisk);
      return risky.length
        ? [
            bold(`${risky.length} need attention`),
            ...risky
              .slice(0, 10)
              .map(
                (r) => `${r.id} ${r.name} – ${r.band}${r.riskDriver ? ` (${r.riskDriver})` : ""}`,
              ),
          ].join("\n")
        : "Nobody is flagged right now. 🎉";
    }
    case "low": {
      // Shortage is per subject, so list each student's weakest subject below 75%.
      const low = rows
        .map((r) => ({
          r,
          worst: r.s.subjects
            .filter((s) => s.classesHeld > 0)
            .map((s) => ({ subject: s.subject, p: (s.classesAttended / s.classesHeld) * 100 }))
            .sort((a, b) => a.p - b.p)[0],
        }))
        .filter((x) => x.worst && x.worst.p < 75)
        .sort((a, b) => a.worst.p - b.worst.p);
      return low.length
        ? [
            bold(`${low.length} with a subject under 75%`),
            ...low
              .slice(0, 12)
              .map(({ r, worst }) => `${r.id} ${r.name} – ${worst.subject} ${pct(worst.p)}`),
          ].join("\n")
        : "Every subject is at or above 75%.";
    }
    case "student": {
      if (!arg) return "Send the student ID, like *student S-101*.";
      const row = rows.find((r) => r.id.toLowerCase() === arg.toLowerCase());
      // Students outside the caller's permission never appear in `rows`, so they look unknown.
      return row ? studentSummary(row) : "I could not find that student among yours.";
    }
    case "timetable":
      return `${bold("Timetable")}\n${await timetableText(db, user)}`;
    default:
      return null;
  }
}

// ------------------------------------------------------------------ the conversation
async function loadSession(db, phone) {
  const { rows } = await db.query(
    `SELECT phone, user_id, step, pending_email, failed_attempts, locked_until, expires_at, updated_at
       FROM whatsapp_sessions WHERE phone = $1`,
    [phone],
  );
  return rows[0] ?? null;
}

// Every timestamp comes from the same `now` the handler was given, never from the database
// clock, so expiry, lockouts and step timeouts all agree with each other (and with the tests).
const save = (db, phone, fields, now) =>
  db.query(
    `INSERT INTO whatsapp_sessions(phone, user_id, step, pending_email, failed_attempts, locked_until, expires_at, updated_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (phone) DO UPDATE SET user_id = $2, step = $3, pending_email = $4,
       failed_attempts = $5, locked_until = $6, expires_at = $7, updated_at = $8`,
    [
      phone,
      fields.userId ?? null,
      fields.step ?? "idle",
      fields.pendingEmail ?? null,
      fields.failed ?? 0,
      fields.lockedUntil ?? null,
      fields.expiresAt ?? null,
      now,
    ],
  );

/** The signed-in account for a number, with roles read fresh from the database every time. */
async function signedInUser(db, session, now) {
  if (!session?.user_id || !session.expires_at || new Date(session.expires_at) < now) return null;
  const { rows } = await db.query(
    `SELECT u.id, u.email, u.display_name,
            COALESCE(array_agg(r.role::text) FILTER (WHERE r.role IS NOT NULL), ARRAY[]::text[]) AS roles
       FROM users u LEFT JOIN user_roles r ON r.user_id = u.id WHERE u.id = $1 GROUP BY u.id`,
    [session.user_id],
  );
  const r = rows[0];
  return r ? { id: r.id, email: r.email, displayName: r.display_name, roles: r.roles } : null;
}

async function attemptLogin(db, phone, session, password, now) {
  const email = session.pending_email;
  const { rows } = await db.query("SELECT id, password_hash FROM users WHERE email = $1", [email]);
  const user = rows[0];
  const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (user && ok) {
    await save(
      db,
      phone,
      { userId: user.id, expiresAt: new Date(now.getTime() + SESSION_HOURS * 3600_000) },
      now,
    );
    await db.query("INSERT INTO login_events(user_id) VALUES($1)", [user.id]).catch(() => {});
    const signed = await signedInUser(db, await loadSession(db, phone), now);
    return `✅ Signed in as ${signed.displayName || signed.email}.\n\n${helpText(signed)}\n\nFor your safety, delete the message that contained your password.`;
  }
  const failed = (session.failed_attempts ?? 0) + 1;
  if (failed >= MAX_FAILS) {
    await save(
      db,
      phone,
      { failed, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000) },
      now,
    );
    return `Too many wrong attempts. Sign-in from this number is locked for ${LOCK_MINUTES} minutes.`;
  }
  await save(db, phone, { failed }, now);
  return "Incorrect email or password. Send *login* to try again.";
}

/**
 * Handles one incoming WhatsApp message and returns the reply text.
 * `now` is injectable so tests can move the clock.
 */
export async function handleMessage(db, { from, body }, now = new Date()) {
  const phone = from;
  const text = (body ?? "").trim();
  const lower = text.toLowerCase();
  const today = now.toISOString().slice(0, 10);
  let session = await loadSession(db, phone);

  if (session?.locked_until && new Date(session.locked_until) > now)
    return `Sign-in from this number is locked until ${new Date(session.locked_until).toISOString().slice(11, 16)} UTC. Please try again later.`;

  // A half-finished sign-in is dropped after a few minutes, so a password prompt never lingers.
  if (
    session &&
    session.step !== "idle" &&
    now - new Date(session.updated_at) > STEP_MINUTES * 60_000
  ) {
    await save(
      db,
      phone,
      { userId: session.user_id, expiresAt: session.expires_at, failed: session.failed_attempts },
      now,
    );
    session = await loadSession(db, phone);
  }

  // --- in the middle of signing in
  if (session?.step === "email" || session?.step === "password") {
    if (lower === "cancel") {
      await save(db, phone, { failed: session.failed_attempts }, now);
      return "Sign-in cancelled.";
    }
    if (session.step === "email") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) || text.length > 254)
        return "That does not look like an email. Send your portal email, or *cancel*.";
      await save(
        db,
        phone,
        { step: "password", pendingEmail: text.toLowerCase(), failed: session.failed_attempts },
        now,
      );
      return "Now send your password. (Send *cancel* to stop.)";
    }
    if (text.length > 72) return "That password is too long. Send *login* to start again.";
    return attemptLogin(db, phone, session, text, now);
  }

  const user = await signedInUser(db, session, now);

  if (lower === "login" || lower === "sign in") {
    if (user)
      return `You are already signed in as ${user.displayName || user.email}. Send *logout* to sign out.`;
    await save(db, phone, { step: "email", failed: session?.failed_attempts ?? 0 }, now);
    return "Send the email address of your BIB InsightIQ account.";
  }
  if (lower === "logout" || lower === "sign out") {
    await db.query("DELETE FROM whatsapp_sessions WHERE phone = $1", [phone]);
    return "You are signed out. Send *login* to sign in again.";
  }
  if (!user) {
    // An expired session is cleared so it cannot be mistaken for a live one.
    if (session?.user_id) await save(db, phone, { failed: session.failed_attempts }, now);
    return session?.user_id ? "Your session has expired. Send *login* to sign in again." : WELCOME;
  }

  const [command, ...rest] = lower.split(/\s+/);
  if (["help", "menu", "hi", "hello", "start"].includes(command)) return helpText(user);
  const answer = isStaff(user)
    ? await answerStaff(db, user, command, rest.join(" "), today)
    : await answerStudent(db, user, command, today);
  return cap(answer ?? `I did not understand that.\n\n${helpText(user)}`);
}
