import { describe, expect, it } from "vitest";
import { PERIODS, clashMap, planTimetable } from "@/lib/timetable-plan";

const cohorts = [
  ["Maths", "Physics", "Programming in C"],
  ["Maths", "Physics", "Programming in C"],
  ["Data Structures", "Databases", "Maths"],
];

describe("what clashes with what", () => {
  it("is every other subject a student takes", () => {
    const clashes = clashMap(cohorts);
    expect([...clashes.get("Physics")].sort()).toEqual(["Maths", "Programming in C"]);
    expect([...clashes.get("Maths")].sort()).toEqual([
      "Data Structures",
      "Databases",
      "Physics",
      "Programming in C",
    ]);
    expect(clashes.get("Databases").has("Physics")).toBe(false);
  });
});

describe("planning the week", () => {
  const plan = planTimetable({ cohorts, classesPerWeek: () => 3 });

  it("gives every subject the classes it asked for", () => {
    expect(plan.unplaced).toEqual([]);
    for (const subject of ["Maths", "Physics", "Programming in C", "Databases"])
      expect(plan.slots.filter((s) => s.subject === subject)).toHaveLength(3);
  });

  it("never puts two subjects of the same student in one period", () => {
    for (const cohort of cohorts) {
      const seen = new Set();
      for (const slot of plan.slots.filter((s) => cohort.includes(s.subject))) {
        const cell = `${slot.day}:${slot.period}`;
        expect(seen.has(cell)).toBe(false);
        seen.add(cell);
      }
    }
  });

  it("spreads a subject's classes over different days and uses real class times", () => {
    const maths = plan.slots.filter((s) => s.subject === "Maths");
    expect(new Set(maths.map((s) => s.day)).size).toBe(3);
    for (const slot of plan.slots) {
      const period = PERIODS.find((p) => p.period === slot.period);
      expect(slot.start).toBe(period.start);
      expect(slot.end).toBe(period.end);
      expect(slot.day).toBeGreaterThanOrEqual(1);
      expect(slot.day).toBeLessThanOrEqual(5);
    }
  });

  it("leaves subjects that already have a timetable untouched and works around their classes", () => {
    const taken = [{ subject: "Maths", day: 1, period: 1 }];
    const next = planTimetable({ cohorts, skip: ["Maths"], taken, classesPerWeek: () => 2 });
    expect(next.slots.some((s) => s.subject === "Maths")).toBe(false);
    expect(next.slots.some((s) => s.day === 1 && s.period === 1 && s.subject === "Physics")).toBe(
      false,
    );
    // Databases shares no student with Maths, so that period is free for it.
    expect(next.slots.filter((s) => s.subject === "Databases")).toHaveLength(2);
  });

  it("says which subjects could not be placed instead of dropping them", () => {
    const crowded = planTimetable({ cohorts, classesPerWeek: () => 40 });
    expect(crowded.unplaced.length).toBeGreaterThan(0);
    expect(crowded.unplaced[0]).toHaveProperty("short");
  });
});
