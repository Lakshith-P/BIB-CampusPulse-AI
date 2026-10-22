import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { SEED_STUDENTS } from "./fixtures/seed-students";
import { successScore } from "@/lib/scoring";
import { academicRisk, placementRisk, effectiveBand } from "@/lib/risk-flags";
import { riskBand } from "@/lib/types";
function loadReference() {
  const text = readFileSync(__dirname + "/fixtures/students_unified_clean.csv", "utf8");
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const cols = header.split(",");
  const idx = (n) => cols.indexOf(n);
  const num = (v) => (v === "" ? null : parseFloat(v));
  return lines.map((line) => {
    const v = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((x) => x.replace(/^"|"$/g, ""));
    return {
      id: v[idx("student_id")],
      score: num(v[idx("success_score")]),
      acadPts: num(v[idx("academic_risk_points")]) ?? 0,
      acadLevel: v[idx("academic_risk_level")],
      placePts: num(v[idx("placement_risk_points")]) ?? 0,
      placeLevel: v[idx("placement_risk_level")],
      band: v[idx("band")],
    };
  });
}
describe("300-student dataset answer key", () => {
  const ref = loadReference();
  const byId = new Map(SEED_STUDENTS.map((s) => [s.id, s]));
  it("seed contains all 300 reference students", () => {
    expect(SEED_STUDENTS.length).toBe(300);
    for (const r of ref) expect(byId.has(r.id), r.id).toBe(true);
  });
  it("success scores match the answer key (±1.5 for LMS unit rounding)", () => {
    const mismatches = [];
    for (const r of ref) {
      const s = byId.get(r.id);
      const got = successScore(s).score;
      if (r.score === null) {
        if (got !== null) mismatches.push(`${r.id}: expected null, got ${got}`);
      } else if (got === null || Math.abs(got - r.score) > 1.5) {
        mismatches.push(`${r.id}: expected ${r.score}, got ${got}`);
      }
    }
    expect(mismatches.slice(0, 10)).toEqual([]);
  });
  it("academic risk points and levels match", () => {
    const mismatches = [];
    for (const r of ref) {
      const f = academicRisk(byId.get(r.id));
      if (Math.abs(f.points - r.acadPts) > 0.01 || f.level !== r.acadLevel)
        mismatches.push(
          `${r.id}: expected ${r.acadPts}/${r.acadLevel}, got ${f.points}/${f.level}`,
        );
    }
    expect(mismatches.slice(0, 10)).toEqual([]);
  });
  it("placement risk points and levels match", () => {
    const mismatches = [];
    for (const r of ref) {
      const f = placementRisk(byId.get(r.id));
      if (Math.abs(f.points - r.placePts) > 0.01 || f.level !== r.placeLevel)
        mismatches.push(
          `${r.id}: expected ${r.placePts}/${r.placeLevel}, got ${f.points}/${f.level}`,
        );
    }
    expect(mismatches.slice(0, 10)).toEqual([]);
  });
  it("bands match, including the High-flag downgrade", () => {
    const mismatches = [];
    for (const r of ref) {
      const s = byId.get(r.id);
      const sc = successScore(s);
      const band = effectiveBand(
        sc.score,
        sc.score === null ? null : riskBand(sc.score),
        academicRisk(s),
        placementRisk(s),
      );
      if (band !== r.band) mismatches.push(`${r.id}: expected ${r.band}, got ${band}`);
    }
    expect(mismatches.slice(0, 10)).toEqual([]);
  });
});
