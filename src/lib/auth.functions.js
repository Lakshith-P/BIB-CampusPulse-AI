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
import { createHash } from "node:crypto";
import { checkCaptcha, createCaptcha } from "@/backend/captcha.server";
import { requireAuth } from "@/backend/auth-middleware";
import { query, withTransaction } from "@/backend/db.server";
import {
  completeForgotPassword,
  requestForgotPassword,
  requestPasswordChange as requestChange,
} from "@/backend/registration.server";
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

// There is no sign-up. An administrator registers every student and teacher (Login credentials in the
// administrator workspace), and the system emails each person a generated password. The first
// administrator is created from the command line: npm run db:create-admin -- <email> "<name>".
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
    // Picking a workspace never grants access; it has to match a role the account holds. A wrong
    // workspace gets the same answer as a wrong password, so it does not say what the account is.
    const held = await query("SELECT 1 FROM user_roles WHERE user_id = $1 AND role = $2", [
      user.id,
      data.workspace,
    ]);
    if (!held.rowCount) throw new Error("Incorrect email or password.");
    await startSession(user.id);
    return { ok: true };
  });
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

// "Forgot your password?", step 1. The person asks; the request goes to the administrators, who
// see it under Login credentials. The answer says only whether it is still waiting or approved, and
// is the same for an email with no account, so this cannot be used to find out who is registered.
export const requestPasswordReset = createServerFn({ method: "POST" })
  .validator(z.object({ email, ...captcha }))
  .handler(async ({ data }) => {
    limitByIp("forgot", 12, 60 * 60 * 1000);
    await checkCaptcha(data.captchaToken, data.captchaAnswer);
    return withTransaction((db) => requestForgotPassword(db, { email: data.email }));
  });

// Step 2, once an administrator has approved: the person chooses the new password here, and it is
// saved to the database. The approval works once and for a limited time.
export const setForgottenPassword = createServerFn({ method: "POST" })
  .validator(z.object({ email, password, ...captcha }))
  .handler(async ({ data }) => {
    limitByIp("forgot-set", 10, 15 * 60 * 1000);
    await checkCaptcha(data.captchaToken, data.captchaAnswer);
    return withTransaction((db) =>
      completeForgotPassword(db, { email: data.email, password: data.password }),
    );
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
// A signed-in person asks to change their password. It takes effect when an administrator approves.
export const requestPasswordChange = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ current: z.string().min(1).max(72), next: password }))
  .handler(async ({ data, context }) => {
    limitByIp("passwd", 10, 15 * 60 * 1000);
    return withTransaction((db) => requestChange(db, context.user, data));
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
