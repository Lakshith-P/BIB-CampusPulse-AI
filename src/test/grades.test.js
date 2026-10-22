import { describe, expect, it } from "vitest";
import {
  cgpaOf,
  gradeFor,
  recalculatedGrades,
  semesterResult,
  withCurrentSgpa,
} from "@/lib/grades";

describe("marks to grades", () => {
  it("follows the ten-point scale the results page shows", () => {
    expect(gradeFor(95)).toEqual({ letter: "O", points: 10, passed: true });
    expect(gradeFor(80)).toEqual({ letter: "A+", points: 9, passed: true });
    expect(gradeFor(40)).toEqual({ letter: "C", points: 5, passed: true });
    expect(gradeFor(39)).toEqual({ letter: "F", points: 0, passed: false });
  });
});

describe("semester result", () => {
  const subjects = [
    { subject: "Maths", marks: 85 }, // A+ = 9, 4 credits
    { subject: "Physics", marks: 72 }, // A  = 8, 3 credits
    { subject: "Lab", marks: 35 }, // F  = 0, 2 credits
  ];
  const credits = { Maths: 4, Physics: 3, Lab: 2 };

  it("weights grade points by the credits of each subject", () => {
    const r = semesterResult(subjects, (s) => credits[s]);
    expect(r.credits).toBe(9);
    expect(r.weighted).toBe(9 * 4 + 8 * 3);
    expect(r.sgpa).toBe(6.67);
    expect(r.failed).toEqual(["Lab"]);
  });

  it("counts an unknown subject as four credits and ignores subjects with no marks", () => {
    const r = semesterResult([{ subject: "Maths", marks: 85 }, { subject: "Physics" }]);
    expect(r.rows).toHaveLength(1);
    expect(r.credits).toBe(4);
    expect(r.sgpa).toBe(9);
  });

  it("reports nothing to work from when no marks are recorded", () => {
    expect(semesterResult([]).sgpa).toBeNull();
    expect(semesterResult(undefined).sgpa).toBeNull();
    expect(cgpaOf([])).toBeNull();
  });
});

describe("the semester list", () => {
  it("puts the current semester in its own place", () => {
    expect(withCurrentSgpa([8, 7.5], 3, 8.25)).toEqual([8, 7.5, 8.25]);
    expect(withCurrentSgpa([8, 7.5, 6], 3, 9)).toEqual([8, 7.5, 9]);
  });

  it("appends rather than inventing the semesters in between", () => {
    expect(withCurrentSgpa([8], 5, 7)).toEqual([8, 7]);
    expect(withCurrentSgpa([], 1, 7.333)).toEqual([7.33]);
  });
});

describe("recalculated grades", () => {
  it("sets the current SGPA and averages the semesters for the CGPA", () => {
    const next = recalculatedGrades(
      {
        semester: 3,
        cgpa: 7.8,
        semesterGrades: [8, 7.5],
        subjects: [
          { subject: "A", marks: 65 },
          { subject: "B", marks: 75 },
        ],
      },
      () => 4,
    );
    expect(next.sgpa).toBe(7.5);
    expect(next.semesterGrades).toEqual([8, 7.5, 7.5]);
    expect(next.cgpa).toBe(7.67);
  });

  it("leaves a record with no marks alone", () => {
    expect(recalculatedGrades({ semester: 1, subjects: [] })).toBeNull();
  });
});
