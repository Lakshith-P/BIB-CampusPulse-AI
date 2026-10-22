import { describe, expect, it } from "vitest";
import {
  BELOW_THRESHOLD_MARKS,
  combine,
  marksFor,
  plan,
  projectMissing,
  warningFor,
} from "@/lib/attendance-planner";

describe("attendance planner", () => {
  it("applies the configured marks bands", () => {
    expect(marksFor(95)).toBe(5);
    expect(marksFor(90)).toBe(5);
    expect(marksFor(89.9)).toBe(4);
    expect(marksFor(85)).toBe(4);
    expect(marksFor(80)).toBe(3);
    expect(marksFor(75)).toBe(2);
    expect(marksFor(74.9)).toBe(BELOW_THRESHOLD_MARKS);
    expect(marksFor(null)).toBeNull();
  });

  it("works out classes needed and classes that can be missed from real counts", () => {
    // 30 of 40 attended = 75%. To reach 80%: (30+x)/(40+x) >= 0.8 -> x >= 10.
    const p = plan({ subject: "Maths", held: 40, attended: 30 }, 80, 20);
    expect(p).toMatchObject({ missed: 10, need: 10, reachable: true, marks: 2 });
    // At 75% target nothing can be missed.
    expect(plan({ subject: "Maths", held: 40, attended: 30 }, 75, 20).canMiss).toBe(0);
    // 36/40 = 90%: at 85% target, 36/(40+x) >= .85 -> x <= 2.35 -> 2.
    expect(plan({ subject: "M", held: 40, attended: 36 }, 85, 20).canMiss).toBe(2);
  });

  it("reports when a target cannot be reached with the classes that remain", () => {
    const p = plan({ subject: "Maths", held: 40, attended: 24 }, 90, 10);
    expect(p.reachable).toBe(false);
    expect(p.bestCase).toBeCloseTo((34 / 50) * 100);
  });

  it("projects attendance after skipping the next classes", () => {
    expect(projectMissing(40, 36, 10, 0)).toBeCloseTo((46 / 50) * 100);
    expect(projectMissing(40, 36, 10, 4)).toBeCloseTo((42 / 50) * 100);
    expect(projectMissing(40, 36, 10, 99)).toBeCloseTo((36 / 50) * 100);
  });

  it("raises red for a breach and amber near the threshold, each with reason and action", () => {
    const breach = warningFor(plan({ subject: "Maths", held: 40, attended: 28 }, 75, 20), 20);
    expect(breach.level).toBe("breach");
    expect(breach.reason).toMatch(/70\.0%/);
    expect(breach.action).toMatch(/next 8 class/);

    const near = warningFor(plan({ subject: "Physics", held: 40, attended: 31 }, 75, 20), 20);
    expect(near.level).toBe("approaching");

    expect(warningFor(plan({ subject: "OK", held: 40, attended: 38 }, 75, 20), 20)).toBeNull();
    expect(warningFor(plan({ subject: "None", held: 0, attended: 0 }, 75, 20), 20)).toBeNull();
  });

  it("combines subjects into an overall figure", () => {
    expect(
      combine([
        { classesHeld: 40, classesAttended: 30 },
        { classesHeld: 20, classesAttended: 20 },
      ]),
    ).toEqual({ subject: "Overall", held: 60, attended: 50 });
  });
});
