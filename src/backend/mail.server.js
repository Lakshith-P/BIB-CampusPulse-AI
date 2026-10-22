import nodemailer from "nodemailer";

// Email is optional. Set SMTP_URL (for example smtps://you%40gmail.com:app-password@smtp.gmail.com)
// and APP_URL (the public address of this site) to send password-reset links. Without both, the
// reset request goes to the administrators' Messages instead.
export const mailReady = () => Boolean(process.env["SMTP_URL"] && process.env["APP_URL"]);

export const appUrl = () => String(process.env["APP_URL"]).replace(/\/+$/, "");

let transport;
export async function sendMail({ to, subject, text, html }) {
  transport ??= nodemailer.createTransport(process.env["SMTP_URL"]);
  await transport.sendMail({
    from: process.env["MAIL_FROM"] || "BIB InsightIQ <no-reply@orbit.local>",
    to,
    subject,
    text,
    html,
  });
}
