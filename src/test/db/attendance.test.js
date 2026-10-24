// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addStudent, addUser, createTestDb, recordOf } from "./harness";
import * as attendance from "@/backend/attendance.server";

const TODAY = "2026-10-21";
const maths = (held, attended) => [
  { subject: "Maths", marks: 70, classesHeld: held, classesAttended: attended },
];

let ctx, db, admin, teacher, other, ann, ben, cara;

beforeAll(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  admin = await addUser(db, "admin@x.edu", "Admin", ["admin"]);
  teacher = await addUser(db, "t1@x.edu", "Teacher One", ["faculty"]);
  other = await addUser(db, "t2@x.edu", "Teacher Two", ["faculty"]);
  ann = await addUser(db, "ann@x.edu", "Ann");
  ben = await addUser(db, "ben@x.edu", "Ben");
  cara = await addUser(db, "cara@x.edu", "Cara");
  await addStudent(db, "S-ANN", ann, teacher, { subjects: maths(10, 8) });
  await addStudent(db, "S-BEN", ben, teacher, { subjects: maths(10, 10) });
  await addStudent(db, "S-CARA", cara, other, { subjects: maths(10, 5) });
}, 60_000);

afterAll(() => ctx?.close());

const base = { subject: "Maths", date: "2026-10-20", period: 1 };
const totals = async (id) => (await recordOf(db, id)).subjects[0];

describe("marking attendance", () => {
  it("lists only assigned students and does not update totals before saving", async () => {
    const r = await attendance.loadRoster(db, teacher, base);
    expect(r.marked).toBe(false);
    expect(r.students.map((s) => s.id)).toEqual(["S-ANN", "S-BEN"]);
    expect(r.students.every((s) => s.present)).toBe(true);
    expect(await totals("S-ANN")).toMatchObject({ classesHeld: 10, classesAttended: 8 });
    expect(await totals("S-BEN")).toMatchObject({ classesHeld: 10, classesAttended: 10 });
    expect(await totals("S-CARA")).toMatchObject({ classesHeld: 10, classesAttended: 5 });
  });

  it("updates held/attended totals and notifies the absent student", async () => {
    const r = await attendance.markAttendance(
      db,
      teacher,
      { ...base, marks: [{ studentId: "S-ANN", present: false }] },
      TODAY,
    );
    expect(r).toMatchObject({ present: 1, absent: 1 });
    expect(await totals("S-ANN")).toMatchObject({ classesHeld: 11, classesAttended: 8 });
    expect(await totals("S-BEN")).toMatchObject({ classesHeld: 11, classesAttended: 11 });
    expect(await totals("S-CARA")).toMatchObject({ classesHeld: 10, classesAttended: 5 });
    const n = await db.query("SELECT title FROM notifications WHERE user_id = $1", [ann.id]);
    expect(n.rows[0].title).toMatch(/absent in Maths/);
  });

  it("re-marking the same class corrects it instead of counting it twice", async () => {
    await attendance.markAttendance(
      db,
      teacher,
      {
        ...base,
        marks: [
          { studentId: "S-ANN", present: true },
          { studentId: "S-BEN", present: false },
        ],
      },
      TODAY,
    );
    expect(await totals("S-ANN")).toMatchObject({ classesHeld: 11, classesAttended: 9 });
    expect(await totals("S-BEN")).toMatchObject({ classesHeld: 11, classesAttended: 10 });
    const r = await attendance.loadRoster(db, teacher, base);
    expect(r.marked).toBe(true);
    expect(r.students.find((s) => s.id === "S-BEN").present).toBe(false);
    expect(await attendance.recentSessions(db, teacher, { subject: "Maths" })).toMatchObject([
      { held_on: base.date, period: base.period, present: 1, absent: 1 },
    ]);
  });

  it("limits each teacher to assigned students, and rejects unrelated subjects", async () => {
    expect(await attendance.attendanceSubjects(db, other)).toEqual(["Maths"]);
    const otherRoster = await attendance.loadRoster(db, other, { ...base, period: 2 });
    expect(otherRoster.students.map((s) => s.id)).toEqual(["S-CARA"]);
    await expect(
      attendance.markAttendance(
        db,
        teacher,
        { ...base, period: 2, marks: [{ studentId: "S-CARA", present: false }] },
        TODAY,
      ),
    ).rejects.toThrow(/not in your class/);
    const saved = await attendance.markAttendance(
      db,
      other,
      { ...base, period: 2, marks: [{ studentId: "S-CARA", present: false }] },
      TODAY,
    );
    expect(saved).toMatchObject({ present: 0, absent: 1 });
    expect(await totals("S-CARA")).toMatchObject({ classesHeld: 11, classesAttended: 5 });
    const history = await attendance.loadRoster(db, other, { ...base, period: 2 });
    expect(history.marked).toBe(true);
    expect(history.students[0].present).toBe(false);
    expect(await attendance.recentSessions(db, teacher, { subject: "Maths" })).toHaveLength(1);
    expect(await attendance.recentSessions(db, other, { subject: "Maths" })).toMatchObject([
      { held_on: base.date, period: 2, present: 0, absent: 1 },
    ]);
    await expect(
      attendance.loadRoster(db, teacher, { ...base, subject: "History" }),
    ).rejects.toThrow(/assigned to you/);
    await expect(
      attendance.markAttendance(db, ann, { ...base, marks: [] }, TODAY),
    ).rejects.toThrow();
    await expect(
      attendance.markAttendance(db, teacher, { ...base, date: "2026-10-22", marks: [] }, TODAY),
    ).rejects.toThrow(/future/);
    expect(await totals("S-CARA")).toMatchObject({ classesHeld: 11, classesAttended: 5 });
  });

  it("lets an administrator mark everyone and a student see only their own log", async () => {
    const r = await attendance.loadRoster(db, admin, { ...base, period: 2 });
    expect(r.students).toHaveLength(3);
    const log = await attendance.myAttendance(db, ann, { subject: "Maths" });
    expect(log.sessions).toEqual([
      { subject: "Maths", held_on: "2026-10-20", period: 1, present: true },
    ]);
    expect(log).toMatchObject({ present: 1, absent: 0, subjects: ["Maths"] });
    // No subject means every subject on the record, and a subject they do not take is refused.
    const all = await attendance.myAttendance(db, ann, { subject: "" });
    expect(all.sessions).toEqual(log.sessions);
    await expect(attendance.myAttendance(db, ann, { subject: "Chemistry" })).rejects.toThrow();
  });
});

describe("an account that is both a teacher and an administrator", () => {
  it("marks attendance only for the students assigned to them, like any teacher", async () => {
    const both = await addUser(db, "both@x.edu", "Both", ["admin", "faculty"]);
    // no students yet: the whole campus is not theirs to mark
    expect(await attendance.attendanceSubjects(db, both)).toEqual([]);
    await expect(attendance.loadRoster(db, both, { ...base, period: 3 })).rejects.toThrow(
      /assigned to you/,
    );
    const dee = await addUser(db, "dee@x.edu", "Dee");
    await addStudent(db, "S-DEE", dee, both, { subjects: maths(4, 4) });
    const roster = await attendance.loadRoster(db, both, { ...base, period: 3 });
    expect(roster.students.map((x) => x.id)).toEqual(["S-DEE"]);
    await expect(
      attendance.markAttendance(
        db,
        both,
        { ...base, period: 3, marks: [{ studentId: "S-ANN", present: false }] },
        TODAY,
      ),
    ).rejects.toThrow(/not in your class/);
    // leave the shared data as it was for the tests after this one
    await db.query("DELETE FROM student_records WHERE id = 'S-DEE'");
    await db.query("DELETE FROM users WHERE id = ANY($1)", [[both.id, dee.id]]);
  });
});

describe("timetable", () => {
  it("lets a teacher add classes, rejects clashes and bad times, and shows them to students", async () => {
    await attendance.saveSlot(db, teacher, {
      subject: "Maths",
      day: 1,
      start: "09:00",
      end: "10:00",
      room: "A1",
    });
    await expect(
      attendance.saveSlot(db, teacher, {
        subject: "Maths",
        day: 1,
        start: "09:30",
        end: "10:30",
        room: "",
      }),
    ).rejects.toThrow(/already has a class/);
    await expect(
      attendance.saveSlot(db, teacher, {
        subject: "Maths",
        day: 2,
        start: "11:00",
        end: "10:00",
        room: "",
      }),
    ).rejects.toThrow(/end after/);
    const t = await attendance.loadTimetable(db, ann);
    expect(t.slots).toMatchObject([
      { subject: "Maths", day: 1, start: "09:00", end: "10:00", room: "A1" },
    ]);
  });

  it("stops students and unrelated teachers from changing it", async () => {
    await expect(
      attendance.saveSlot(db, ann, {
        subject: "Maths",
        day: 3,
        start: "09:00",
        end: "10:00",
        room: "",
      }),
    ).rejects.toThrow();
    const { slots } = await attendance.loadTimetable(db, teacher);
    await expect(attendance.deleteSlot(db, ann, { id: slots[0].id })).rejects.toThrow();
    await attendance.deleteSlot(db, teacher, { id: slots[0].id });
    expect((await attendance.loadTimetable(db, teacher)).slots).toEqual([]);
  });

  it("says which students have no class scheduled for a subject they take", async () => {
    // The test above removed the last slot, so nobody has a timetable at this point.
    const before = await attendance.timetableCoverage(db, admin);
    expect(before.map((r) => r.id)).toEqual(["S-ANN", "S-BEN", "S-CARA"]);
    expect(before.every((r) => r.classes === 0 && r.missing[0] === "Maths")).toBe(true);

    await attendance.saveSlot(db, teacher, {
      subject: "Maths",
      day: 2,
      start: "11:00",
      end: "12:00",
      room: "B2",
    });
    const after = await attendance.timetableCoverage(db, admin);
    expect(after.every((r) => r.classes === 1 && r.missing.length === 0)).toBe(true);

    // A teacher only ever sees the students assigned to them.
    const mine = await attendance.timetableCoverage(db, teacher);
    expect(mine.map((r) => r.id)).toEqual(["S-ANN", "S-BEN"]);
    await expect(attendance.timetableCoverage(db, ann)).rejects.toThrow();
  });
});

describe("giving every student a timetable", () => {
  it("plans the week for every subject students take and clashes with nothing", async () => {
    const r = await attendance.generateTimetable(db, admin, { replace: true });
    expect(r.unplaced).toEqual([]);
    expect(r.subjects).toBe(1);
    expect(r.students).toMatchObject({ total: 3, with_classes: 3, without_subjects: 0 });
    const slots = await db.query(
      "SELECT day, to_char(start_time,'HH24:MI') AS start, room FROM timetable_slots ORDER BY day",
    );
    expect(slots.rows).toHaveLength(r.added);
    // One class a day at most for the same subject, and every class in a real room.
    expect(new Set(slots.rows.map((s) => s.day)).size).toBe(slots.rows.length);
    expect(slots.rows.every((s) => s.room.startsWith("Room"))).toBe(true);
    const coverage = await attendance.timetableCoverage(db, admin);
    expect(coverage.every((c) => c.classes === r.added && c.missing.length === 0)).toBe(true);
  });

  it("leaves subjects that already have classes alone", async () => {
    const before = await db.query("SELECT count(*)::int AS n FROM timetable_slots");
    const r = await attendance.generateTimetable(db, admin, {});
    expect(r.added).toBe(0);
    expect(r.kept).toBe(1);
    const after = await db.query("SELECT count(*)::int AS n FROM timetable_slots");
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("is for administrators only", async () => {
    await expect(attendance.generateTimetable(db, teacher, {})).rejects.toThrow(
      /Only administrators/,
    );
    await expect(attendance.generateTimetable(db, ann, {})).rejects.toThrow();
  });
});
