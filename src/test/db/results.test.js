// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addStudent, addUser, createTestDb, recordOf } from "./harness";
import * as results from "@/backend/results.server";

let ctx, db, admin, teacher, other, ann, ben, cara, dev;

const subjects = (marks) =>
  Object.entries(marks).map(([subject, m]) => ({
    subject,
    marks: m,
    classesHeld: 10,
    classesAttended: 9,
  }));

beforeAll(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  admin = await addUser(db, "admin@x.edu", "Admin", ["admin"]);
  teacher = await addUser(db, "t1@x.edu", "Teacher One", ["faculty"]);
  other = await addUser(db, "t2@x.edu", "Teacher Two", ["faculty"]);
  ann = await addUser(db, "ann@x.edu", "Ann");
  ben = await addUser(db, "ben@x.edu", "Ben");
  cara = await addUser(db, "cara@x.edu", "Cara");
  dev = await addUser(db, "dev@x.edu", "Dev");
  // Ann is in semester 3 with two semesters behind her; her marks decide the third.
  await addStudent(db, "S-ANN", ann, teacher, {
    semester: 3,
    cgpa: 7.8,
    semesterGrades: [8, 7.5],
    subjects: subjects({ Maths: 85, Physics: 72, Lab: 35 }),
  });
  // Ben is in his first semester: no SGPA on record at all yet.
  await addStudent(db, "S-BEN", ben, teacher, {
    semester: 1,
    cgpa: 0,
    semesterGrades: [],
    subjects: subjects({ Maths: 61, Physics: 64 }),
  });
  // Cara belongs to the other teacher, and Dev has no marks at all.
  await addStudent(db, "S-CARA", cara, other, {
    semester: 1,
    subjects: subjects({ Maths: 90 }),
  });
  await addStudent(db, "S-DEV", dev, teacher, { semester: 1, subjects: [] });
  await db.query(
    `INSERT INTO lms_syllabus(subject, code, title, lectures, tutorials, practicals, credits)
     VALUES('Maths','MTH101','Maths',3,1,0,4), ('Physics','PHY101','Physics',3,0,0,3),
            ('Lab','LAB101','Lab',0,0,4,2)`,
  );
}, 60_000);

afterAll(() => ctx?.close());

describe("recalculating results from the marks on record", () => {
  it("weights each subject by its syllabus credits and averages the semesters", async () => {
    const r = await results.recalculateGrades(db, teacher, {});
    const ids = r.changed.map((c) => c.id);
    expect(ids).toContain("S-ANN");
    expect(ids).not.toContain("S-CARA"); // not this teacher's student
    const ann = await recordOf(db, "S-ANN");
    // (9x4 + 8x3 + 0x2) / 9 credits = 6.67, so semester 3 takes that SGPA
    expect(ann.semesterGrades).toEqual([8, 7.5, 6.67]);
    expect(ann.cgpa).toBe(7.39);
    expect(r.changed.find((c) => c.id === "S-ANN")).toMatchObject({
      sgpa: 6.67,
      wasCgpa: 7.8,
      failed: ["Lab"],
    });
  });

  it("gives a first-semester student their first SGPA and the matching CGPA", async () => {
    const ben = await recordOf(db, "S-BEN");
    // 7x4 + 7x3 = 49 over 7 credits
    expect(ben.semesterGrades).toEqual([7]);
    expect(ben.cgpa).toBe(7);
  });

  it("leaves a student with no marks exactly as they were", async () => {
    const r = await results.recalculateGrades(db, teacher, {});
    expect(r.skipped.map((x) => x.id)).toContain("S-DEV");
    const dev = await recordOf(db, "S-DEV");
    expect(dev.cgpa).toBe(0);
    expect(dev.semesterGrades).toEqual([]);
  });

  it("changes nothing on a second run, and never touches the marks themselves", async () => {
    const before = await recordOf(db, "S-ANN");
    const r = await results.recalculateGrades(db, teacher, {});
    expect(r.changed).toEqual([]);
    const after = await recordOf(db, "S-ANN");
    expect(after.subjects).toEqual(before.subjects);
    expect(after).toEqual(before);
  });

  it("reaches every student for an administrator and logs each change", async () => {
    const r = await results.recalculateGrades(db, admin, {});
    expect(r.changed.map((c) => c.id)).toEqual(["S-CARA"]);
    expect((await recordOf(db, "S-CARA")).cgpa).toBe(10);
    const audit = await db.query(
      "SELECT count(*)::int AS n FROM campus_audit WHERE record_id = 'S-CARA'",
    );
    expect(audit.rows[0].n).toBe(1);
  });

  it("is refused to students, and to a teacher naming someone else's student", async () => {
    await expect(results.recalculateGrades(db, ann, {})).rejects.toThrow(/Only teachers/);
    await expect(results.recalculateGrades(db, teacher, { studentId: "S-CARA" })).rejects.toThrow(
      /not assigned to you/,
    );
  });
});

describe("the breakdown behind an SGPA", () => {
  it("shows each subject with its grade, points and credits", async () => {
    const b = await results.gradeBreakdown(db, ann, { studentId: "S-ANN" });
    expect(b.rows).toHaveLength(3);
    expect(b.rows.find((r) => r.subject === "Maths")).toMatchObject({
      marks: 85,
      letter: "A+",
      points: 9,
      credits: 4,
    });
    expect(b.sgpa).toBe(6.67);
    expect(b.credits).toBe(9);
  });

  it("is not readable for a student who is not yours", async () => {
    await expect(results.gradeBreakdown(db, ann, { studentId: "S-CARA" })).rejects.toThrow(
      /not found/,
    );
  });
});
