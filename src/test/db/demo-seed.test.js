// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDb } from "./harness";
import { generate, STUDENT_COUNT, TEACHER_COUNT } from "../../../scripts/demo-data/generate.js";
import { resetDemo, seedDatabase } from "../../../scripts/demo-data/write.js";
import { buildRows } from "@/lib/campus-derive";
import { loadLms } from "@/backend/lms.server";
import { listDrives } from "@/backend/placement.server";
import { listOpportunities } from "@/backend/engagement.server";
import { syncNotifications, listNotifications } from "@/backend/notifications.server";
import { studentSchema } from "@/lib/student-validation";
import { filterRows, byBranch, dataQuality } from "@/lib/analytics";

const TODAY = "2026-10-21";
let ctx;
let db;
let data;
let summary;

beforeAll(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  data = generate({ today: TODAY });
  summary = await seedDatabase(db, data, { passwordHash: "x" });
}, 120_000);
afterAll(() => ctx?.close());

describe("generated data", () => {
  it("is reproducible", () => {
    const again = generate({ today: TODAY });
    expect(again.students.map((s) => s.name)).toEqual(data.students.map((s) => s.name));
    expect(JSON.stringify(again.students[10].record)).toBe(
      JSON.stringify(data.students[10].record),
    );
  });

  it("covers the requested people, years, branches, sections and genders", () => {
    expect(data.students).toHaveLength(STUDENT_COUNT);
    expect(data.teachers).toHaveLength(TEACHER_COUNT);
    expect(new Set(data.students.map((s) => s.year))).toEqual(new Set([1, 2, 3, 4]));
    expect(new Set(data.students.map((s) => s.branch)).size).toBe(4);
    expect(new Set(data.students.map((s) => s.section))).toEqual(new Set(["A", "B"]));
    expect(new Set(data.students.map((s) => s.gender))).toEqual(new Set(["Male", "Female"]));
    expect(new Set(data.students.map((s) => s.email)).size).toBe(STUDENT_COUNT);
    const perTeacher = Object.values(
      data.students.reduce((m, s) => ({ ...m, [s.teacherKey]: (m[s.teacherKey] ?? 0) + 1 }), {}),
    );
    expect(perTeacher).toHaveLength(TEACHER_COUNT);
    expect(Math.min(...perTeacher)).toBeGreaterThanOrEqual(5);
  });

  it("produces records the app accepts", () => {
    for (const s of data.students) {
      const parsed = studentSchema.safeParse(s.record);
      expect(parsed.success, `${s.id}: ${parsed.error?.message}`).toBe(true);
    }
  });
});

describe("stored data", () => {
  const count = async (sql, p = []) => Number((await db.query(sql, p)).rows[0].n);

  it("stores accounts, roles and linked records", async () => {
    expect(
      await count("SELECT count(*)::int AS n FROM users WHERE email LIKE '%@insightiq.demo'"),
    ).toBe(170);
    expect(await count("SELECT count(*)::int AS n FROM user_roles WHERE role = 'faculty'")).toBe(
      20,
    );
    expect(
      await count(
        "SELECT count(*)::int AS n FROM student_records WHERE owner_id IS NOT NULL AND faculty_id IS NOT NULL",
      ),
    ).toBe(150);
  });

  it("fills every section of the dashboard", async () => {
    expect(summary.submissions).toBeGreaterThan(300);
    for (const table of [
      "lms_units",
      "lms_materials",
      "lms_assignments",
      "lms_progress",
      "lms_submissions",
      "skill_assessments",
      "mock_interviews",
      "satisfaction_ratings",
      "placement_drives",
      "drive_applications",
      "opportunities",
      "opportunity_participation",
      "campus_interventions",
      "complaints",
      "campus_updates",
      "login_events",
    ])
      expect(await count(`SELECT count(*)::int AS n FROM ${table}`), table).toBeGreaterThan(0);
  });

  it("feeds LMS progress into the students' records and scores", async () => {
    const { rows } = await db.query("SELECT id, record FROM student_records ORDER BY id");
    const withLms = rows.filter((r) => r.record.lms?.length);
    expect(withLms.length).toBeGreaterThan(120);
    const all = buildRows(
      rows.map((r) => ({ record: r.record, owner_id: "o", faculty_id: "f" })),
      TODAY,
    );
    expect(all).toHaveLength(150);
    const bands = new Set(all.map((r) => r.band));
    expect(bands.size).toBeGreaterThanOrEqual(3);
    expect(all.filter((r) => r.score === null)).toHaveLength(3);
    expect(all.some((r) => r.academicRisk === "High")).toBe(true);
    expect(all.some((r) => r.placementRisk === "High")).toBe(true);
    expect(all.some((r) => r.attendance !== null && r.attendance < 75)).toBe(true);
  });

  it("gives analytics something to show for every filter", async () => {
    const { rows } = await db.query("SELECT record FROM student_records");
    const all = buildRows(
      rows.map((r) => ({ record: r.record, owner_id: "o", faculty_id: "f" })),
      TODAY,
    );
    for (const year of [1, 2, 3, 4]) expect(filterRows(all, { year }).length).toBeGreaterThan(20);
    expect(byBranch(all).map((b) => b.branch)).toEqual(["CSE", "ECE", "IT", "MECH"]);
    expect(dataQuality(all).coverage.every((c) => c.have > 0)).toBe(true);
  });

  it("shows a student their own subjects, drives and opportunities", async () => {
    const s = data.students.find((x) => x.year === 4 && x.archetype === "strong");
    const { rows } = await db.query("SELECT id FROM users WHERE email = $1", [s.email]);
    const user = { id: rows[0].id, roles: ["student"], displayName: s.name, email: s.email };
    const lms = await loadLms(db, user);
    expect(lms.subjects).toHaveLength(5);
    expect(lms.subjects[0].units).toHaveLength(6);
    expect(lms.subjects[0].units[0].materials.length).toBeGreaterThan(1);
    expect(lms.activity.month).toBeGreaterThan(0);
    const drives = await listDrives(db, user, TODAY);
    expect(drives).toHaveLength(6);
    expect(drives.some((d) => d.eligibility?.eligible)).toBe(true);
    expect((await listOpportunities(db, user, TODAY)).length).toBe(10);
  });

  it("shows a teacher only their own students' subjects", async () => {
    const t = data.teachers[0];
    const { rows } = await db.query("SELECT id FROM users WHERE email = $1", [t.email]);
    const teacher = {
      id: rows[0].id,
      roles: ["student", "faculty"],
      displayName: t.name,
      email: t.email,
    };
    const lms = await loadLms(db, teacher);
    const mine = new Set(
      data.students
        .filter((s) => s.teacherKey === t.key)
        .flatMap((s) => (s.subjects ?? []).map((x) => x.subject)),
    );
    expect(lms.subjects.map((s) => s.subject).sort()).toEqual([...mine].sort());
  });

  it("raises notifications from the seeded data", async () => {
    const s = data.students.find((x) => x.archetype === "lowAttendance" && x.subjects?.length);
    const { rows } = await db.query("SELECT id FROM users WHERE email = $1", [s.email]);
    const user = { id: rows[0].id, roles: ["student"], displayName: s.name, email: s.email };
    await syncNotifications(db, user, TODAY);
    expect((await listNotifications(db, user)).items.length).toBeGreaterThan(0);
  });
});

describe("removing the demo data", () => {
  it("refuses to seed twice, and removes only demo rows", async () => {
    await expect(seedDatabase(db, data, { passwordHash: "x" })).rejects.toThrow(/already present/);
    await db.query(
      "INSERT INTO users(email, password_hash, display_name) VALUES('real@campus.edu','x','Real Person')",
    );
    const subjects = [...new Set(data.lms.units.map((u) => u.subject))];
    const removed = await resetDemo(db, subjects);
    expect(removed.users).toBe(170);
    const left = await db.query("SELECT email FROM users");
    expect(left.rows.map((r) => r.email)).toEqual(["real@campus.edu"]);
    for (const table of [
      "student_records",
      "lms_materials",
      "lms_assignments",
      "lms_units",
      "placement_drives",
      "opportunities",
      "campus_updates",
      "campus_interventions",
      "complaints",
    ])
      expect(
        Number((await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n),
        table,
      ).toBe(0);
    // and it can be seeded again afterwards
    await seedDatabase(db, data, { passwordHash: "x" });
    expect(
      Number((await db.query("SELECT count(*)::int AS n FROM student_records")).rows[0].n),
    ).toBe(150);
  }, 120_000);
});
