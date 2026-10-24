// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addStudent, addUser, createTestDb } from "./harness";
import { MIN_COHORT, cohortStanding } from "@/backend/student-record.server";

const subjects = (attended) => [
  { subject: "Maths", marks: 70, classesHeld: 40, classesAttended: attended },
];
const over = (cgpa, attended, grades) => ({
  semester: 3,
  cgpa,
  semesterGrades: grades,
  subjects: subjects(attended),
});

let ctx, db, me, lonely;

beforeAll(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  me = await addUser(db, "me@x.edu", "Me");
  await addStudent(db, "S-ME", me, null, over(8.5, 38, [8.0, 8.4]));
  // Five classmates in the same branch and semester, all scoring below "me".
  for (let i = 0; i < MIN_COHORT; i++) {
    const u = await addUser(db, `peer${i}@x.edu`, `Peer ${i}`);
    await addStudent(
      db,
      `S-P${i}`,
      u,
      null,
      over(6 + i * 0.3, 25 + i, [6 + i * 0.2, 6.2 + i * 0.2]),
    );
  }
  // A different semester is not part of the cohort.
  const other = await addUser(db, "other@x.edu", "Other");
  await addStudent(db, "S-OTHER", other, null, { ...over(9.9, 40, [9.9]), semester: 5 });

  lonely = await addUser(db, "lonely@x.edu", "Lonely");
  await addStudent(db, "S-LONE", lonely, null, { ...over(7, 30, [7]), branch: "MECH" });
}, 60_000);

afterAll(() => ctx?.close());

describe("cohort standing", () => {
  it("ranks the student against same-branch, same-semester peers using aggregates only", async () => {
    const c = await cohortStanding(db, me);
    expect(c.enough).toBe(true);
    expect(c.cohortSize).toBe(MIN_COHORT + 1);
    expect(c.rank).toBe(1);
    expect(c.topPercent).toBeLessThanOrEqual(20);

    const academics = c.competencies.find((x) => x.key === "academics");
    expect(academics.mine).toBe(85);
    expect(academics.percentile).toBe(100);
    expect(academics.median).toBeGreaterThan(60);

    expect(c.sgpa).toHaveLength(2);
    expect(c.sgpa[1].mine).toBe(8.4);
    expect(c.sgpa[1].top10).toBeGreaterThan(c.sgpa[1].median);

    // Nothing that identifies a classmate is returned.
    const text = JSON.stringify(c);
    expect(text).not.toContain("S-P");
    expect(text).not.toContain("Peer");
  });

  it("withholds every comparison when the cohort is too small to stay anonymous", async () => {
    const c = await cohortStanding(db, lonely);
    expect(c.enough).toBe(false);
    expect(c.rank).toBeNull();
    expect(c.competencies).toEqual([]);
    expect(c.sgpa).toEqual([]);
  });
});
