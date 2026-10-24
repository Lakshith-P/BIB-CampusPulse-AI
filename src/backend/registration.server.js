import { randomBytes, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { adminIds, notify, requireAdminUser } from "./access.server.js";
import { studentSchema } from "@/lib/student-validation";
import { emptyStudent } from "@/lib/student-defaults";

// Accounts are not created by the people who use them. An administrator registers each student and
// teacher (one by one, or from a CSV); the system makes a password and emails it. A person then
// changes it only through a request that an administrator approves, and "forgot password" is a
// request too. Nothing here trusts the browser: every function checks the caller's role.

const BCRYPT_COST = 12;
const hashPassword = (password) => bcrypt.hash(password, BCRYPT_COST);
/** How long an approved "forgot password" request stays open for the person to use. */
export const APPROVAL_HOURS = 24;

// No 0/O, 1/l/I look-alikes, so a password read from an email is typed correctly.
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "@#%?+";

/** A new random password: 12 characters with a capital, a small letter, a digit and a symbol. */
export function generatePassword() {
  const pick = (set) => set[randomInt(set.length)];
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  const all = UPPER + LOWER + DIGITS + SYMBOLS;
  while (chars.length < 12) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

// ------------------------------------------------------------------ logins made from a name
/** The domain of a login made from a name: bharath becomes bharath@insightiq.com. */
export const loginDomain = () => process.env["LOGIN_EMAIL_DOMAIN"]?.trim() || "insightiq.com";

/** The first name as it is used in a login: lower case, letters and digits only ("Bhaarth K" becomes "bhaarth"). */
export function firstNameKey(name) {
  const first = String(name ?? "")
    .trim()
    .split(/\s+/)[0]
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return first || "user";
}

/** The first free login for a name: bharath@insightiq.com, then bharath2@..., bharath3@... */
export async function uniqueLoginEmail(db, name) {
  const base = firstNameKey(name);
  const domain = loginDomain();
  for (let n = 1; n < 10000; n++) {
    const local = n === 1 ? base : `${base}${n}`;
    const taken = await db.query("SELECT 1 FROM users WHERE email = $1", [`${local}@${domain}`]);
    if (!taken.rowCount) return { email: `${local}@${domain}`, local };
  }
  throw new Error("Could not make a login for that name.");
}

/** The shortest password the platform accepts. */
export const MIN_PASSWORD = 8;

/**
 * The starting password for a login: the name, an @, and the first letter, for example bharath@b.
 * When that is shorter than 8 characters, numbers (1, 2, 3 ...) are added until it is 8: ram@r becomes ram@r123.
 */
export function startingPassword(local) {
  const base = `${local}@${local[0]}`;
  return base.length >= MIN_PASSWORD
    ? base
    : base + "12345678".slice(0, MIN_PASSWORD - base.length);
}

/**
 * How mail is sent. In the app these come from mail.server.js; tests pass their own, so no real
 * email is ever sent from a test.
 */
export async function defaultMailer() {
  const mail = await import("./mail.server.js");
  return {
    ready: mail.mailReady(),
    send: mail.sendMail,
    appUrl: mail.mailReady() ? mail.appUrl() : "",
  };
}

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function welcomeMail({ name, email, password, role, loginUrl }) {
  const who = role === "faculty" ? "teacher" : "student";
  const text = `Hello ${name},

An SLQG account has been created for you as a ${who}.

Log in at: ${loginUrl}
Email: ${email}
Temporary password: ${password}

To change your password, use "Change password" after logging in. The change is sent to an administrator for approval first. If you ever forget it, use "Forgot password" on the login page; an administrator approves it and you receive a link to choose a new one.

Keep this email private.`;
  const html = `<p>Hello ${escapeHtml(name)},</p>
<p>An SLQG account has been created for you as a ${who}.</p>
<p>Log in at: <a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a><br>
Email: <b>${escapeHtml(email)}</b><br>
Temporary password: <b>${escapeHtml(password)}</b></p>
<p>To change your password, use <i>Change password</i> after logging in. The change is sent to an administrator for approval first. If you forget it, use <i>Forgot password</i> on the login page; an administrator approves it and you receive a link to choose a new one.</p>
<p>Keep this email private.</p>`;
  return { subject: "Your SLQG login", text, html };
}

/**
 * Registers one student or teacher: a user with a generated password and the right role (a student
 * also gets a student record, a teacher gets no student role or record), then emails the login.
 * Returns what happened. When email cannot be sent the password is returned once so the
 * administrator can hand it over; it is never stored in readable form.
 */
export async function registerUser(db, admin, person, mailer, hash = hashPassword) {
  requireAdminUser(admin);
  const name = person.name.trim();
  // With no email given, the login is made from the name: bharath@insightiq.com
  const given = person.email?.trim().toLowerCase() || "";
  const made = given ? null : await uniqueLoginEmail(db, name);
  const email = given || made.email;
  const local = made ? made.local : firstNameKey(name);
  const exists = given
    ? await db.query("SELECT 1 FROM users WHERE email = $1", [email])
    : { rowCount: 0 };
  if (exists.rowCount) return { email, name, role: person.role, status: "exists" };

  let teacherId = null;
  if (person.role === "student" && person.teacherEmail) {
    const t = await db.query(
      `SELECT u.id FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role = 'faculty'
        WHERE u.email = $1`,
      [person.teacherEmail.toLowerCase()],
    );
    if (!t.rowCount)
      return {
        email,
        name,
        role: person.role,
        status: "failed",
        reason: "That teacher is not registered.",
      };
    teacherId = t.rows[0].id;
  }
  let record = null;
  if (person.role === "student") {
    const used = person.studentId
      ? await db.query("SELECT 1 FROM student_records WHERE id = $1", [person.studentId])
      : { rowCount: 0 };
    if (used.rowCount)
      return {
        email,
        name,
        role: person.role,
        status: "failed",
        reason: "That student ID is already used.",
      };
    const parsed = studentSchema.safeParse({
      ...emptyStudent,
      id: person.studentId || `ACC-${randomBytes(4).toString("hex").toUpperCase()}`,
      name,
      ...(person.course ? { course: person.course } : {}),
      ...(person.branch ? { branch: person.branch } : {}),
      ...(person.section ? { section: person.section } : {}),
      ...(person.semester ? { semester: person.semester } : {}),
      ...(person.gradYear ? { gradYear: person.gradYear } : {}),
    });
    if (!parsed.success)
      return {
        email,
        name,
        role: person.role,
        status: "failed",
        reason: "Some student details are not valid.",
      };
    record = parsed.data;
  }

  const password = startingPassword(local);
  const created = await db.query(
    "INSERT INTO users(email, password_hash, display_name) VALUES($1,$2,$3) RETURNING id",
    [email, await hash(password), name],
  );
  const userId = created.rows[0].id;
  await db.query("INSERT INTO user_roles(user_id, role) VALUES($1,$2)", [userId, person.role]);
  if (record)
    await db.query(
      "INSERT INTO student_records(id, owner_id, faculty_id, record) VALUES($1,$2,$3,$4)",
      [record.id, userId, teacherId, JSON.stringify(record)],
    );
  await db.query(
    "INSERT INTO campus_audit(actor_id, record_id, operation) VALUES($1,$2,'REGISTER')",
    [admin.id, record?.id ?? userId],
  );

  const result = {
    email,
    name,
    role: person.role,
    status: "created",
    emailed: false,
    generated: Boolean(made),
  };
  // A login made from a name is not a real mailbox, so only an email the administrator typed is mailed.
  if (mailer.ready && !made) {
    try {
      await mailer.send({
        to: email,
        ...welcomeMail({
          name,
          email,
          password,
          role: person.role,
          loginUrl: `${mailer.appUrl}/auth`,
        }),
      });
      result.emailed = true;
    } catch (error) {
      result.mailError = error instanceof Error ? error.message : "The email could not be sent.";
    }
  }
  if (!result.emailed) result.password = password;
  return result;
}

/** Registers several people; a problem with one row never stops the rest. */
export async function registerMany(db, admin, people, mailer, hash) {
  requireAdminUser(admin);
  if (people.length > 500) throw new Error("Register at most 500 people at a time.");
  const results = [];
  for (const person of people) {
    // A savepoint per person, so one failure rolls back only that person.
    await db.query("SAVEPOINT person");
    try {
      results.push(await registerUser(db, admin, person, mailer, hash));
      await db.query("RELEASE SAVEPOINT person");
    } catch (error) {
      await db.query("ROLLBACK TO SAVEPOINT person");
      results.push({
        email: person.email ?? "",
        name: person.name,
        role: person.role,
        status: "failed",
        reason: error instanceof Error ? error.message : "Could not register.",
      });
    }
  }
  return {
    results,
    created: results.filter((r) => r.status === "created").length,
    emailed: results.filter((r) => r.emailed).length,
    skipped: results.filter((r) => r.status === "exists").length,
    failed: results.filter((r) => r.status === "failed").length,
  };
}

// ------------------------------------------------------------------ password requests
async function tellAdmins(db, { title, body, key }) {
  for (const id of await adminIds(db))
    await notify(db, id, {
      area: "Login credentials",
      priority: "high",
      title,
      body,
      link: "/portal/access",
      key,
    });
}

/**
 * "Forgot password", step 1. The person asks on the login page; an administrator approves it; the
 * person then sets a new password on the same page (step 2). It works by email address and never
 * says whether the address has an account: an address with no account just waits forever.
 * Returns where the request stands: "pending" (waiting for the administrator) or "approved"
 * (the person may now choose a new password).
 */
export async function requestForgotPassword(db, { email }) {
  const open = await db.query(
    `SELECT status FROM password_requests
      WHERE email = $1 AND kind = 'forgot'
        AND (status = 'pending' OR (status = 'approved' AND expires_at > now()))
      ORDER BY created_at DESC LIMIT 1`,
    [email],
  );
  if (open.rowCount) return { state: open.rows[0].status };
  const { rows } = await db.query("SELECT id, display_name FROM users WHERE email = $1", [email]);
  const user = rows[0];
  const req = await db.query(
    "INSERT INTO password_requests(user_id, email, kind) VALUES($1,$2,'forgot') RETURNING id",
    [user?.id ?? null, email],
  );
  if (user)
    await tellAdmins(db, {
      title: `Forgot password: ${user.display_name || email}`,
      body: `${email} asked for a new password. Approve it under Login credentials.`,
      key: `password-request:${req.rows[0].id}`,
    });
  return { state: "pending" };
}

/**
 * "Forgot password", step 2: the administrator has approved, so the person sets a new password. The
 * approval works once and only for a while (APPROVAL_HOURS).
 */
export async function completeForgotPassword(db, { email, password }, hash = hashPassword) {
  const found = await db.query(
    `SELECT id, user_id FROM password_requests
      WHERE email = $1 AND kind = 'forgot' AND status = 'approved' AND expires_at > now()
        AND user_id IS NOT NULL
      ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
    [email],
  );
  const req = found.rows[0];
  if (!req)
    throw new Error("There is no approved request for this email. Ask for a new password first.");
  await db.query("UPDATE password_requests SET status = 'completed' WHERE id = $1", [req.id]);
  await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
    await hash(password),
    req.user_id,
  ]);
  await db.query(
    "INSERT INTO campus_audit(actor_id, record_id, operation) VALUES($1,$2,'PASSWORD')",
    [req.user_id, req.user_id],
  );
  return { changed: true };
}

/** A signed-in person asks to change their password; it applies only when an administrator approves. */
export async function requestPasswordChange(db, user, { current, next }, hash = hashPassword) {
  const { rows } = await db.query(
    "SELECT password_hash, display_name, email FROM users WHERE id = $1",
    [user.id],
  );
  if (!(await bcrypt.compare(current, rows[0]?.password_hash ?? "")))
    throw new Error("Current password is incorrect.");
  // Only the latest request stands.
  await db.query(
    "UPDATE password_requests SET status = 'rejected', decided_at = now() WHERE user_id = $1 AND kind = 'change' AND status = 'pending'",
    [user.id],
  );
  const req = await db.query(
    "INSERT INTO password_requests(user_id, email, kind, new_hash) VALUES($1,$2,'change',$3) RETURNING id",
    [user.id, rows[0].email, await hash(next)],
  );
  await tellAdmins(db, {
    title: `Password change: ${rows[0].display_name || rows[0].email}`,
    body: `${rows[0].email} asked to change their password. Approve it under Login credentials.`,
    key: `password-request:${req.rows[0].id}`,
  });
  return { requested: true };
}

export async function listPasswordRequests(db, admin) {
  requireAdminUser(admin);
  const { rows } = await db.query(
    `SELECT r.id, r.kind, r.status, r.created_at, r.decided_at, r.expires_at, u.email, u.display_name,
            (SELECT array_agg(role::text) FROM user_roles WHERE user_id = u.id) AS roles
       FROM password_requests r JOIN users u ON u.id = r.user_id
      ORDER BY (r.status = 'pending') DESC, r.created_at DESC LIMIT 100`,
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    status: r.status,
    email: r.email,
    name: r.display_name || r.email,
    roles: r.roles ?? [],
    createdAt: new Date(r.created_at).toISOString(),
    decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null,
    // an approved "forgot" request the person has not used yet
    waiting: r.status === "approved" && r.kind === "forgot" && new Date(r.expires_at) > new Date(),
  }));
}

/**
 * Approves or rejects a request.
 *  forgot + approve: lets the person set a new password on the login page (see completeForgotPassword)
 *  change + approve: puts the requested password in place
 *  reject:           nothing changes; the person is told by email when mail is set up
 */
export async function decidePasswordRequest(db, admin, { id, decision }, mailer) {
  requireAdminUser(admin);
  const found = await db.query(
    `SELECT r.id, r.kind, r.new_hash, r.status, u.id AS user_id, u.email, u.display_name
       FROM password_requests r JOIN users u ON u.id = r.user_id WHERE r.id = $1 FOR UPDATE OF r`,
    [id],
  );
  const req = found.rows[0];
  if (!req) throw new Error("That request was not found.");
  if (req.status !== "pending") throw new Error("That request has already been decided.");
  const status = decision === "approve" ? "approved" : "rejected";
  await db.query(
    "UPDATE password_requests SET status = $2, decided_by = $3, decided_at = now(), new_hash = NULL WHERE id = $1",
    [id, status, admin.id],
  );
  const result = { status, email: req.email, emailed: false };
  const hello = `Hello ${req.display_name || req.email},`;
  const send = async (subject, text) => {
    if (!mailer.ready) return;
    try {
      await mailer.send({ to: req.email, subject, text });
      result.emailed = true;
    } catch {
      result.emailed = false;
    }
  };

  if (decision !== "approve") {
    await send(
      "Your SLQG password request",
      `${hello}\n\nYour password request was not approved. Your password has not changed. Ask your administrator if you need help.`,
    );
    return result;
  }
  if (req.kind === "change") {
    await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
      req.new_hash,
      req.user_id,
    ]);
    await db.query(
      "INSERT INTO campus_audit(actor_id, record_id, operation) VALUES($1,$2,'PASSWORD')",
      [admin.id, req.user_id],
    );
    await send(
      "Your SLQG password was changed",
      `${hello}\n\nYour password change was approved. You can now log in with your new password.`,
    );
    return result;
  }
  // The person is not emailed a link. They go back to the login page, ask again, and set the new
  // password there. Email, when set up, only tells them the request was approved.
  await db.query(
    "UPDATE password_requests SET expires_at = now() + make_interval(hours => $2) WHERE id = $1",
    [id, APPROVAL_HOURS],
  );
  await send(
    "Your SLQG password request was approved",
    `${hello}\n\nAn administrator approved your request. Open the login page, choose "Forgot your password?", enter your email and set a new password. This is open for ${APPROVAL_HOURS} hours.`,
  );
  return result;
}
