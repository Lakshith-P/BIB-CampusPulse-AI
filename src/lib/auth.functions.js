import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  currentUser,
  endSession,
  hashPassword,
  limitByIp,
  startSession,
  verifyPassword,
} from "@/backend/auth.server";
import { createHash, randomBytes } from "node:crypto";
import { checkCaptcha, createCaptcha } from "@/backend/captcha.server";
import { appUrl, mailReady, sendMail } from "@/backend/mail.server";
import { requireAuth } from "@/backend/auth-middleware";
import { query, withTransaction } from "@/backend/db.server";
import { ensureStudentRecord } from "@/backend/student-record.server";
const email = z.string().trim().toLowerCase().email().max(254);
const password = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Use at most 72 characters.");
const captcha = {
  captchaToken: z.string().min(1).max(2000),
  captchaAnswer: z.string().trim().min(1).max(10),
};

export const getCaptcha = createServerFn({ method: "POST" }).handler(async () => {
  limitByIp("captcha", 60, 15 * 60 * 1000);
  return createCaptcha();
});

export const getSession = createServerFn({ method: "GET" }).handler(async () => currentUser());
const emailList = (name) =>
  (process.env[name] ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

// Anyone can create an account in any workspace, but the powers differ:
//  - Student: active straight away.
//  - Teacher: active if the email is in TEACHER_EMAILS; otherwise the account is created and a
//    request appears in the administrators' Messages for one-click approval (People & roles).
//  - Administrator: active if the email is in ADMIN_EMAILS, or if the site has no administrator
//    yet (first set-up). Otherwise refused, so nobody can make themselves an administrator.
// Someone who already has an account can ask for teacher or administrator access by signing up
// again with their existing password.
export const signUp = createServerFn({ method: "POST" })
  .validator(
    z.object({
      email,
      password,
      name: z.string().trim().max(100).default(""),
      workspace: z.enum(["student", "faculty", "admin"]).default("student"),
      ...captcha,
    }),
  )
  .handler(async ({ data }) => {
    limitByIp("signup", 10, 60 * 60 * 1000);
    await checkCaptcha(data.captchaToken, data.captchaAnswer);
    const { workspace } = data;
    const bootstrapAdmin = emailList("ADMIN_EMAILS").includes(data.email);
    const autoTeacher = emailList("TEACHER_EMAILS").includes(data.email);
    if (workspace === "admin" && !bootstrapAdmin) {
      const anyAdmin = await query("SELECT 1 FROM user_roles WHERE role = 'admin' LIMIT 1");
      if (anyAdmin.rowCount)
        throw new Error(
          "Administrator accounts must be approved. Ask an existing administrator to give you access, or have your email added to ADMIN_EMAILS.",
        );
    }
    const outcome = await withTransaction(async (db) => {
      const found = await db.query(
        "SELECT id, password_hash, display_name FROM users WHERE email = $1 FOR UPDATE",
        [data.email],
      );
      let user = found.rows[0];
      if (user) {
        if (workspace === "student" || !(await verifyPassword(data.password, user.password_hash)))
          return { exists: true };
      } else {
        const created = await db.query(
          "INSERT INTO users(email, password_hash, display_name) VALUES($1,$2,$3) RETURNING id, display_name",
          [data.email, await hashPassword(data.password), data.name],
        );
        user = created.rows[0];
        await db.query("INSERT INTO user_roles(user_id, role) VALUES($1,'student')", [user.id]);
        if (workspace === "student" && !bootstrapAdmin)
          await ensureStudentRecord(db, { ...user, email: data.email });
      }
      const held = (
        await db.query("SELECT role::text AS role FROM user_roles WHERE user_id = $1", [user.id])
      ).rows.map((r) => r.role);
      const give = (role) =>
        db.query("INSERT INTO user_roles(user_id, role) VALUES($1,$2) ON CONFLICT DO NOTHING", [
          user.id,
          role,
        ]);
      if (bootstrapAdmin && !held.includes("admin")) await give("admin");
      if (workspace === "admin") {
        await give("admin");
        return { id: user.id, status: "active" };
      }
      if (workspace === "faculty" && !held.includes("faculty")) {
        if (autoTeacher || bootstrapAdmin) {
          await give("faculty");
          return { id: user.id, status: "active" };
        }
        await db.query(
          `INSERT INTO contact_messages(user_id, name, email, message)
           SELECT $1, $2, $3, $4
            WHERE NOT EXISTS (SELECT 1 FROM contact_messages
                               WHERE user_id = $1 AND message = $4 AND created_at > now() - interval '1 day')`,
          [
            user.id,
            user.display_name || data.email,
            data.email,
            "Teacher access requested. Approve it under People & roles with Make faculty.",
          ],
        );
        return { id: user.id, status: "pending" };
      }
      return { id: user.id, status: "active" };
    });
    if (outcome.exists)
      throw new Error("An account with this email already exists. Try signing in.");
    if (outcome.status === "active") await startSession(outcome.id);
    return { ok: true, status: outcome.status };
  });
export const signIn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      email,
      password: z.string().min(1).max(72),
      workspace: z.enum(["student", "faculty", "admin"]).default("student"),
      ...captcha,
    }),
  )
  .handler(async ({ data }) => {
    limitByIp("signin", 20, 15 * 60 * 1000);
    await checkCaptcha(data.captchaToken, data.captchaAnswer);
    const { rows } = await query("SELECT id, password_hash FROM users WHERE email = $1", [
      data.email,
    ]);
    const user = rows[0];
    const valid = await verifyPassword(data.password, user?.password_hash);
    if (!user || !valid) throw new Error("Incorrect email or password.");
    // Picking a workspace never grants access; it only has to match a role the account holds.
    const held = await query("SELECT 1 FROM user_roles WHERE user_id = $1 AND role = $2", [
      user.id,
      data.workspace,
    ]);
    if (!held.rowCount) {
      throw new Error(
        data.workspace === "faculty"
          ? "This account does not have teacher access yet. If you just signed up as a teacher, an administrator has to approve it first."
          : data.workspace === "admin"
            ? "This account does not have administrator access."
            : "This account does not have student access.",
      );
    }
    await startSession(user.id);
    return { ok: true };
  });
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const RESET_MINUTES = 30;

// Step 1 of "Forgot your password?". The answer is the same whether or not the email has an
// account, so this cannot be used to find out who is registered.
export const requestPasswordReset = createServerFn({ method: "POST" })
  .validator(z.object({ email, ...captcha }))
  .handler(async ({ data }) => {
    limitByIp("forgot", 8, 60 * 60 * 1000);
    await checkCaptcha(data.captchaToken, data.captchaAnswer);
    const delivery = mailReady() ? "email" : "admin";
    const { rows } = await query("SELECT id, display_name FROM users WHERE email = $1", [
      data.email,
    ]);
    const user = rows[0];
    if (!user) return { delivery };
    let sent = false;
    if (delivery === "email") {
      const token = randomBytes(32).toString("base64url");
      await query("DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL", [user.id]);
      await query(
        `INSERT INTO password_resets(token_hash, user_id, expires_at)
         VALUES($1, $2, now() + make_interval(mins => $3))`,
        [sha256(token), user.id, RESET_MINUTES],
      );
      const link = `${appUrl()}/new-password?token=${token}`;
      try {
        await sendMail({
          to: data.email,
          subject: "Reset your BIB InsightIQ password",
          text: `Hello${user.display_name ? " " + user.display_name : ""},\n\nUse this link to choose a new password. It works once and expires in ${RESET_MINUTES} minutes:\n${link}\n\nIf you did not ask for this, ignore this email; your password has not changed.`,
          html: `<p>Hello${user.display_name ? " " + user.display_name : ""},</p><p><a href="${link}">Choose a new password</a>. The link works once and expires in ${RESET_MINUTES} minutes.</p><p>If you did not ask for this, ignore this email; your password has not changed.</p>`,
        });
        sent = true;
      } catch (error) {
        console.error(
          "Password reset email failed:",
          error instanceof Error ? error.message : error,
        );
      }
    }
    if (!sent) {
      // No email available: leave a note for the administrators, once a day per person.
      await query(
        `INSERT INTO contact_messages(user_id, name, email, message)
         SELECT $1, $2, $3, $4
          WHERE NOT EXISTS (SELECT 1 FROM contact_messages
                             WHERE user_id = $1 AND message = $4 AND created_at > now() - interval '1 day')`,
        [
          user.id,
          user.display_name || data.email,
          data.email,
          "Password reset requested from the login page. Reset it under People & roles and share the temporary password privately.",
        ],
      );
    }
    return { delivery };
  });

// Step 2: the link from the email. The token is single-use and is marked used before the
// password changes, so two requests with the same link cannot both succeed.
export const resetPasswordWithToken = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string().min(20).max(200), password }))
  .handler(async ({ data }) => {
    limitByIp("resetpw", 20, 15 * 60 * 1000);
    const used = await query(
      `UPDATE password_resets SET used_at = now()
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING user_id`,
      [sha256(data.token)],
    );
    const userId = used.rows[0]?.user_id;
    if (!userId) throw new Error("This reset link is invalid or has expired. Request a new one.");
    await query("UPDATE users SET password_hash = $1 WHERE id = $2", [
      await hashPassword(data.password),
      userId,
    ]);
    await query("DELETE FROM password_resets WHERE user_id = $1", [userId]);
    await query(
      "INSERT INTO campus_audit(actor_id, record_id, operation) VALUES($1,$2,'PASSWORD')",
      [userId, userId],
    );
    return { ok: true };
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  await endSession();
  return { ok: true };
});
export const changePassword = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ current: z.string().min(1).max(72), next: password }))
  .handler(async ({ data, context }) => {
    limitByIp("passwd", 10, 15 * 60 * 1000);
    const { rows } = await query("SELECT password_hash FROM users WHERE id = $1", [
      context.user.id,
    ]);
    if (!(await verifyPassword(data.current, rows[0]?.password_hash)))
      throw new Error("Current password is incorrect.");
    await query("UPDATE users SET password_hash = $1 WHERE id = $2", [
      await hashPassword(data.next),
      context.user.id,
    ]);
    return { ok: true };
  });
// Open to visitors, so it needs the captcha and a rate limit; a signed-in person is recorded too.
export const sendContactMessage = createServerFn({ method: "POST" })
  .validator(
    z.object({
      name: z.string().trim().min(1).max(100),
      email,
      message: z.string().trim().min(5).max(4000),
      ...captcha,
    }),
  )
  .handler(async ({ data }) => {
    limitByIp("contact", 10, 60 * 60 * 1000);
    await checkCaptcha(data.captchaToken, data.captchaAnswer);
    const user = await currentUser().catch(() => null);
    await query("INSERT INTO contact_messages(user_id, name, email, message) VALUES($1,$2,$3,$4)", [
      user?.id ?? null,
      data.name,
      data.email,
      data.message,
    ]);
    return { saved: true };
  });
