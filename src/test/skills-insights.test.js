import { describe, expect, it } from "vitest";
import { summarizeSkills } from "@/lib/skills-insights";

const h = (category, topic, score, d) => ({ category, topic, score, taken_on: `2026-10-${d}` });

describe("skills insights", () => {
  const s = summarizeSkills([
    h("coding", "Arrays", 40, "01"),
    h("coding", "Arrays", 45, "02"),
    h("coding", "Graphs", 80, "03"),
    h("coding", "Graphs", 90, "04"),
    h("aptitude", "Percentages", 70, "05"),
  ]);

  it("averages the latest three scores as the current level and reports the trend", () => {
    expect(s.byCategory.coding.current).toBeCloseTo((45 + 80 + 90) / 3);
    expect(s.byCategory.coding.latest).toBe(90);
    expect(s.byCategory.coding.trend).toBeCloseTo((45 + 80 + 90) / 3 - 40);
    expect(s.byCategory.aptitude.trend).toBeNull();
  });

  it("finds weak topics and suggests practice only for what the data shows", () => {
    expect(s.weak.map((t) => t.topic)).toEqual(["Arrays"]);
    expect(s.recommendations[0]).toMatch(/^Coding: Arrays averages 43/);
    expect(s.recommendations.some((r) => r.startsWith("Verbal: no assessment"))).toBe(true);
    expect(s.recommendations.some((r) => r.includes("Percentages"))).toBe(false);
  });
});
