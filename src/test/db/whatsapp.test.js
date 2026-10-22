// @vitest-environment node
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addStudent, addUser, createTestDb } from "./harness";
import * as attendance from "@/backend/attendance.server";
import {
  handleMessage,
  twilioSignature,
  twiml,
  validTwilioSignature,
} from "@/backend/whatsapp.server";

const PASSWORD = "correct-horse-1";
const T0 = new Date("2026-10-21T10:00:00Z");
const later = (minutes) => new Date(T0.getTime() + minutes * 60_000);
const subjects = [
  { subject: "Maths", marks: 72, classesHeld: 20, classesAttended: 12 },
  { subject: "Physics", marks: 81, classesHeld: 20, classesAttended: 19 },
];

let ctx, db, teacher, other, admin, ann, cara;
const say = (from, body, at = T0) => handleMessage(db, { from, body }, at);
const login = async (from, email, password = PASSWORD, at = T0) => {
  await say(from, "login", at);
  await say(from, email, at);
  return say(from, password, at);
};

beforeAll(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  teacher = await addUser(db, "t@x.edu", "Teacher One", ["faculty"]);
  other = await addUser(db, "t2@x.edu", "Teacher Two", ["faculty"]);
  admin = await addUser(db, "admin@x.edu", "Admin", ["admin"]);
  ann = await addUser(db, "ann@x.edu", "Ann");
  cara = await addUser(db, "cara@x.edu", "Cara");
  const hash = bcrypt.hashSync(PASSWORD, 4);
  await db.query("UPDATE users SET password_hash = $1", [hash]);
  await addStudent(db, "S-ANN", ann, teacher, { subjects, cgpa: 8.1 });
  await addStudent(db, "S-CARA", cara, other, { subjects, cgpa: 6.2 });
  await attendance.saveSlot(db, teacher, {
    subject: "Maths",
    day: 2,
    start: "09:00",
    end: "10:00",
    room: "B2",
  });
  await db
    .query(
      `INSERT INTO lms_assignments(subject, unit, title, instructions, assigned_on, due_on, max_marks, created_by)
     VALUES('Maths', 1, 'Limits worksheet', '', '2026-10-01', '2026-10-30', 10, $1)`,
      [teacher.id],
    )
    .catch(() => {});
}, 60_000);
afterAll(() => ctx?.close());

describe("Twilio signature", () => {
  const params = { From: "whatsapp:+911", Body: "score" };
  const url = "https://x.example/api/public/whatsapp";
  it("accepts a correctly signed request and rejects anything else", () => {
    const sig = twilioSignature("token", url, params);
    expect(validTwilioSignature("token", url, params, sig)).toBe(true);
    expect(validTwilioSignature("token", url, { ...params, Body: "hack" }, sig)).toBe(false);
    expect(validTwilioSignature("other", url, params, sig)).toBe(false);
    expect(validTwilioSignature("token", url, params, "")).toBe(false);
    expect(validTwilioSignature("", url, params, sig)).toBe(false);
  });
  it("escapes replies", () => {
    expect(twiml("a < b & c")).toContain("a &lt; b &amp; c");
  });
});

describe("signing in inside the chat", () => {
  it("shows a welcome and refuses data until signed in", async () => {
    expect(await say("whatsapp:+1", "score")).toMatch(/Send \*login\*/);
    expect(await say("whatsapp:+1", "attendance")).toMatch(/Send \*login\*/);
  });

  it("asks for email then password, then signs in", async () => {
    const from = "whatsapp:+2";
    expect(await say(from, "login")).toMatch(/email/);
    expect(await say(from, "not an email")).toMatch(/does not look like an email/);
    expect(await say(from, "ANN@x.edu")).toMatch(/password/);
    expect(await say(from, PASSWORD)).toMatch(/Signed in as Ann/);
    expect(await say(from, "login")).toMatch(/already signed in/);
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    const wrong = await login("whatsapp:+3", "ann@x.edu", "nope-nope");
    const unknown = await login("whatsapp:+4", "ghost@x.edu", "nope-nope");
    expect(wrong).toBe(unknown);
    expect(wrong).toMatch(/Incorrect email or password/);
  });

  it("locks the number after five wrong passwords, then lets it back in", async () => {
    const from = "whatsapp:+5";
    let last;
    for (let i = 0; i < 5; i++) last = await login(from, "ann@x.edu", "bad-bad-bad");
    expect(last).toMatch(/locked for 15 minutes/);
    expect(await login(from, "ann@x.edu")).toMatch(/locked until/);
    expect(await login(from, "ann@x.edu", PASSWORD, later(16))).toMatch(/Signed in/);
  });

  it("drops a half-finished sign-in and cancels on request", async () => {
    const from = "whatsapp:+6";
    await say(from, "login");
    await say(from, "ann@x.edu");
    expect(await say(from, PASSWORD, later(11))).toMatch(/Send \*login\*/);
    await say(from, "login");
    expect(await say(from, "cancel")).toMatch(/cancelled/);
  });

  it("expires the session and signs out on request", async () => {
    const from = "whatsapp:+7";
    await login(from, "ann@x.edu");
    expect(await say(from, "score", later(60))).toMatch(/Success Score/);
    expect(await say(from, "score", later(9 * 60))).toMatch(/session has expired/);
    await login(from, "ann@x.edu");
    expect(await say(from, "logout")).toMatch(/signed out/);
    expect(await say(from, "score")).toMatch(/Send \*login\*/);
  });
});

describe("what each person can ask", () => {
  const annPhone = "whatsapp:+10";
  const teacherPhone = "whatsapp:+11";
  const adminPhone = "whatsapp:+12";
  beforeAll(async () => {
    await login(annPhone, "ann@x.edu");
    await login(teacherPhone, "t@x.edu");
    await login(adminPhone, "admin@x.edu");
  });

  it("gives a student their own score, attendance, marks, timetable and assignments", async () => {
    expect(await say(annPhone, "score")).toMatch(/S-ANN/);
    const att = await say(annPhone, "attendance");
    expect(att).toMatch(/Maths: 60%/);
    expect(att).toMatch(/⚠️ Maths/);
    expect(att).toMatch(/Physics: 95%/);
    expect(await say(annPhone, "marks")).toMatch(/Maths: 72/);
    expect(await say(annPhone, "timetable")).toMatch(/Tue 09:00–10:00 {2}Maths \(B2\)/);
    expect(await say(annPhone, "assignments")).toMatch(/Limits worksheet/);
  });

  it("keeps staff commands away from students", async () => {
    expect(await say(annPhone, "students")).toMatch(/did not understand/);
    expect(await say(annPhone, "student S-CARA")).toMatch(/did not understand/);
  });

  it("lets a teacher see only their own students", async () => {
    expect(await say(teacherPhone, "students")).toMatch(/1 students/);
    expect(await say(teacherPhone, "low")).toMatch(/S-ANN.*Maths 60%/);
    expect(await say(teacherPhone, "student s-ann")).toMatch(/S-ANN/);
    expect(await say(teacherPhone, "student S-CARA")).toMatch(/could not find/);
    expect(await say(teacherPhone, "attendance")).toMatch(/did not understand/);
  });

  it("lets an administrator see everyone", async () => {
    expect(await say(adminPhone, "students")).toMatch(/2 students/);
    expect(await say(adminPhone, "student S-CARA")).toMatch(/S-CARA/);
  });

  it("follows a role change immediately", async () => {
    await db.query("DELETE FROM user_roles WHERE user_id = $1 AND role = 'faculty'", [teacher.id]);
    expect(await say(teacherPhone, "students")).not.toMatch(/1 students/);
  });
});
