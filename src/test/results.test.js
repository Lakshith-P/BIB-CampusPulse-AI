import { describe, expect, it } from "vitest";
import { gradeOf } from "@/components/portal/ResultsPages";

describe("gradeOf", () => {
  it("follows the published scale at every boundary", () => {
    const cases = [
      [100, "O"],
      [90, "O"],
      [89.9, "A+"],
      [80, "A+"],
      [79, "A"],
      [70, "A"],
      [69, "B+"],
      [60, "B+"],
      [59, "B"],
      [50, "B"],
      [49, "C"],
      [40, "C"],
      [39, "F"],
      [0, "F"],
    ];
    for (const [marks, grade] of cases) expect(gradeOf(marks), `${marks}`).toBe(grade);
  });
});
