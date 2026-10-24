// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addStudent, addUser, createTestDb } from "./harness";
import { grantAccountRole, revokeAccountRole } from "@/backend/accounts.server";
import { backfillStudentRecords } from "@/backend/student-record.server";

let ctx, db;

beforeAll(async () => {
  ctx = await createTestDb();
  db = ctx.db;
}, 60_000);

afterAll(async () => {
  await ctx?.close();
});

const roles = async (id) =>
  (
    await db.query("SELECT role::text AS role FROM user_roles WHERE user_id = $1 ORDER BY 1", [id])
  ).rows.map((r) => r.role);
const records = async (id) =>
  (await db.query("SELECT id FROM student_records WHERE owner_id = $1", [id])).rows;

// the empty record every student account is given at sign-up
const blank = (id, owner) => addStudent(db, id, owner, null, { branch: "Not set", cgpa: 0 });
const withStudentRole = async (email, extra = []) => {
  const u = await addUser(db, email, email, ["student", ...extra]);
  return u;
};

describe("becoming a teacher", () => {
  it("replaces the student role and removes the empty student record made for the account", async () => {
    const u = await withStudentRole("blank@x.edu");
    await blank("ACC-BLANK", u);
    await grantAccountRole(db, u.id, "faculty");
    expect(await roles(u.id)).toEqual(["faculty"]);
    expect(await records(u.id)).toEqual([]);
  });

  it("keeps a student record that holds real data, but the account is no longer a student", async () => {
    const u = await withStudentRole("real@x.edu");
    await addStudent(db, "ACC-REAL", u, null, {
      cgpa: 7.4,
      subjects: [{ subject: "Maths", marks: 70, classesHeld: 40, classesAttended: 36 }],
    });
    await grantAccountRole(db, u.id, "faculty");
    expect(await roles(u.id)).toEqual(["faculty"]);
    expect((await records(u.id)).map((r) => r.id)).toEqual(["ACC-REAL"]);
  });

  it("keeps an empty-looking record that already has a teacher or a support action", async () => {
    const teacher = await addUser(db, "mentor@x.edu", "Mentor", ["faculty"]);
    const a = await withStudentRole("assigned@x.edu");
    await addStudent(db, "ACC-ASSIGNED", a, teacher, { branch: "Not set", cgpa: 0 });
    const b = await withStudentRole("supported@x.edu");
    await blank("ACC-SUPPORTED", b);
    await db.query(
      "INSERT INTO campus_interventions (student_id, created_by, reason, action, priority, owner, follow_up_date) VALUES ('ACC-SUPPORTED', $1, 'Check in', 'Meet weekly', 'low', 'Mentor', '2030-01-01')",
      [teacher.id],
    );
    await grantAccountRole(db, a.id, "faculty");
    await grantAccountRole(db, b.id, "faculty");
    expect((await records(a.id)).length).toBe(1);
    expect((await records(b.id)).length).toBe(1);
  });

  it("an administrator is not also a student, so the student sign-in refuses them", async () => {
    const u = await withStudentRole("adminlater@x.edu");
    await blank("ACC-ADMINLATER", u);
    await grantAccountRole(db, u.id, "admin");
    expect(await roles(u.id)).toEqual(["admin"]);
    expect((await records(u.id)).length).toBe(0);
  });
});

describe("taking a role away", () => {
  it("returns an account with no role left to being a student, so it still works", async () => {
    const u = await addUser(db, "demoted@x.edu", "Demoted", ["faculty"]);
    await revokeAccountRole(db, u.id, "faculty");
    expect(await roles(u.id)).toEqual(["student"]);
  });

  it("does not add the student role when another role remains", async () => {
    const u = await addUser(db, "both@x.edu", "Both", ["faculty", "admin"]);
    await revokeAccountRole(db, u.id, "admin");
    expect(await roles(u.id)).toEqual(["faculty"]);
  });
});

describe("the background job that creates student records", () => {
  it("creates one for a student without a record, and never for a teacher or a pending teacher", async () => {
    const student = await addUser(db, "needsrecord@x.edu", "Needs Record", ["student"]);
    const teacher = await addUser(db, "teacher@x.edu", "Teacher", ["faculty"]);
    const pending = await addUser(db, "pending@x.edu", "Pending Teacher", []); // signed up as a teacher, not approved yet
    const admin = await addUser(db, "admin@x.edu", "Admin", ["admin"]);
    await backfillStudentRecords(db);
    expect((await records(student.id)).length).toBe(1);
    expect(await records(teacher.id)).toEqual([]);
    expect(await records(pending.id)).toEqual([]);
    expect(await records(admin.id)).toEqual([]);
  });
});

describe("the data cleanup migration", () => {
  it("removes the empty record and the student role from teachers, and nothing else", async () => {
    const legacyBlank = await withStudentRole("legacy-blank@x.edu", ["faculty"]);
    await blank("ACC-LEGACY-BLANK", legacyBlank);
    const legacyData = await withStudentRole("legacy-data@x.edu", ["faculty"]);
    await addStudent(db, "ACC-LEGACY-DATA", legacyData, null, {
      cgpa: 8,
      subjects: [{ subject: "Physics", marks: 80, classesHeld: 40, classesAttended: 38 }],
    });
    const admin = await withStudentRole("legacy-admin@x.edu", ["admin"]);
    await blank("ACC-LEGACY-ADMIN", admin);
    const student = await withStudentRole("legacy-student@x.edu");
    await blank("ACC-LEGACY-STUDENT", student);

    const sql = readFileSync(
      join(process.cwd(), "db", "migrations", "0019_teachers_are_not_students.sql"),
      "utf8",
    );
    for (const statement of sql
      .replace(/--.*$/gm, "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean))
      await db.query(statement);

    expect(await roles(legacyBlank.id)).toEqual(["faculty"]);
    expect(await records(legacyBlank.id)).toEqual([]);
    expect(await roles(legacyData.id)).toEqual(["faculty"]);
    expect((await records(legacyData.id)).length).toBe(1); // real data is kept
    expect(await roles(admin.id)).toEqual(["admin", "student"]); // administrators are not changed
    expect((await records(admin.id)).length).toBe(1);
    expect(await roles(student.id)).toEqual(["student"]); // students are not changed
    expect((await records(student.id)).length).toBe(1);
  });
});
