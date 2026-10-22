import { describe, it, expect } from "vitest";
import {
  attendanceMarks,
  classesNeededForTarget,
  maxMissableClasses,
  attendancePct,
  successScore,
  checkEligibility,
} from "@/lib/scoring";
import { riskBand } from "@/lib/types";
import { SEED_STUDENTS, SEED_DRIVES } from "./fixtures/seed";
import { parseStudentCsv } from "@/lib/csv";
describe("attendance bands", () => {
  it("boundaries", () => {
    expect(attendanceMarks(90)).toBe(5);
    expect(attendanceMarks(89.99)).toBe(4);
    expect(attendanceMarks(85)).toBe(4);
    expect(attendanceMarks(80)).toBe(3);
    expect(attendanceMarks(75)).toBe(2);
    expect(attendanceMarks(74.99)).toBe(0);
    expect(attendanceMarks(null)).toBeNull();
  });
  it("percentage and missing data", () => {
    expect(attendancePct(30, 40)).toBe(75);
    expect(attendancePct(0, 0)).toBeNull();
  });
  it("classes needed and missable", () => {
    expect(classesNeededForTarget(28, 40, 75)).toBe(8); // 36/48 = 75%
    expect(classesNeededForTarget(36, 40, 75)).toBe(0);
    expect(maxMissableClasses(36, 40, 75)).toBe(8); // 36/48 = 75%
    expect(maxMissableClasses(28, 40, 75)).toBe(0);
  });
});
describe("risk bands", () => {
  it("boundaries", () => {
    expect(riskBand(80)).toBe("On Track");
    expect(riskBand(79.9)).toBe("Monitor");
    expect(riskBand(65)).toBe("Monitor");
    expect(riskBand(64.9)).toBe("Needs Attention");
    expect(riskBand(50)).toBe("Needs Attention");
    expect(riskBand(49.9)).toBe("High Priority");
  });
});
describe("success score", () => {
  it("missing data is not treated as zero", () => {
    const s = { ...SEED_STUDENTS[0], lms: [] };
    const r = successScore(s);
    expect(r.missing).toContain("lms");
    expect(r.score).toBeGreaterThan(70);
  });
});
describe("eligibility", () => {
  it("unknown criteria are never eligible", () => {
    const s = { ...SEED_STUDENTS[0], assessmentsRequired: 0 };
    const r = checkEligibility(s, SEED_DRIVES[0]);
    expect(r.eligible).toBe(false);
    expect(r.criteria.some((c) => c.result === "Unknown")).toBe(true);
  });
  it("eligible when all pass", () => {
    expect(checkEligibility(SEED_STUDENTS[0], SEED_DRIVES[0]).eligible).toBe(true);
  });
});
describe("csv import", () => {
  it("flags duplicates and missing fields", () => {
    const csv = `student_id,name,branch,semester,grad_year,cgpa\nBIB-2026-001,X,CSE,6,2027,8\nBIB-2026-050,,CSE,6,2027,8\nBIB-2026-051,Y,CSE,6,2027,11`;
    const { results } = parseStudentCsv(csv, new Set(["BIB-2026-001"]));
    expect(results[0].isDuplicate).toBe(true);
    expect(results[1].missing).toContain("name");
    expect(results[2].errors).toContain("cgpa must be 0–10");
  });
});
