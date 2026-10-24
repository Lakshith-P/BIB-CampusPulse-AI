import { describe, expect, it } from "vitest";

import {
  PLACEMENT_WEIGHTS,
  RESULT_WEIGHTS,
  leetcodePoints,
  placementPrediction,
  predictStudent,
  resultPrediction,
  riskOf,
  slopePerWeek,
} from "@/lib/prediction";
import { emptyStudent } from "@/lib/student-defaults";

const student = (over = {}) => ({ ...emptyStudent, id: "S1", ...over });

describe("weights", () => {
  it("each model's published weights add up to 100", () => {
    expect(Object.values(PLACEMENT_WEIGHTS).reduce((a, b) => a + b)).toBe(100);
    expect(Object.values(RESULT_WEIGHTS).reduce((a, b) => a + b)).toBe(100);
  });
});

describe("placement prediction", () => {
  const strong = {
    student: student({
      cgpa: 8.5,
      skills: { ...emptyStudent.skills, aptitude: 80 },
      resumeCompleteness: 85,
    }),
    coding: { easy: 100, medium: 120, hard: 20, contest_rating: 1700 },
    mocks: [
      { score: 78, date: "2026-08-01" },
      { score: 82, date: "2026-09-01" },
      { score: 86, date: "2026-10-01" },
    ],
  };

  it("scores each criterion and combines them with the published weights", () => {
    expect(leetcodePoints(strong.coding)).toBe(100 + 360 + 120);
    const p = placementPrediction(strong);
    expect(p.components.find((c) => c.key === "leetcode").value).toBe(100); // 580 points, capped
    expect(p.components.find((c) => c.key === "cgpa").value).toBe(85);
    // (25*100 + 20*80 + 20*85 + 20*82 + 15*85) / 100 = 87.15
    expect(p.score).toBeCloseTo(87.15, 1);
    expect(p.band).toBe("Placement-ready");
    expect(p.confidence).toBe("High");
  });

  it("re-scales over missing criteria and lowers confidence instead of scoring them zero", () => {
    const p = placementPrediction({
      student: student({ cgpa: 8, resumeCompleteness: 70 }),
      coding: null,
      mocks: [],
    });
    expect(p.components.find((c) => c.key === "leetcode").value).toBeNull();
    expect(p.score).toBeCloseTo((20 * 80 + 15 * 70) / 35, 1);
    expect(p.confidence).toBe("Low");
  });

  it("projects an improving trend forward, damped, and never past 100", () => {
    const rising = placementPrediction({
      student: student({
        cgpa: 7,
        skills: { ...emptyStudent.skills, aptitude: 55 },
        resumeCompleteness: 60,
      }),
      aptitudeHistory: [
        { score: 40, date: "2026-07-01" },
        { score: 55, date: "2026-09-01" },
      ],
      horizonWeeks: 12,
    });
    expect(rising.projected).toBeGreaterThan(rising.score);
    expect(rising.projected).toBeLessThanOrEqual(100);
    expect(slopePerWeek([{ date: "2026-01-01", value: 1 }])).toBeNull();
  });

  it("ranks sections to improve by the score they would add", () => {
    const p = placementPrediction({
      student: student({
        cgpa: 8,
        skills: { ...emptyStudent.skills, aptitude: 70 },
        resumeCompleteness: 80,
        mockInterviews: 0,
      }),
      coding: { easy: 10, medium: 2, hard: 0 },
    });
    expect(p.improve[0].key).toBe("leetcode");
    expect(p.improve.map((i) => i.key)).toContain("mock");
    expect(p.band).not.toBe("Placement-ready");
  });

  it("reports insufficient data when nothing is recorded", () => {
    expect(placementPrediction({ student: student() }).band).toBe("Insufficient data");
  });
});

describe("result prediction", () => {
  const base = student({
    subjects: [
      { subject: "Math", marks: 35, classesHeld: 40, classesAttended: 26 },
      { subject: "Coding", marks: 80, classesHeld: 40, classesAttended: 38 },
    ],
  });
  const exams = [
    { subject: "Math", kind: "mid1", score: 20, max: 50 },
    { subject: "Math", kind: "mid2", score: 15, max: 50 },
    { subject: "Math", kind: "continuous", score: 5, max: 10 },
    { subject: "Coding", kind: "mid1", score: 42, max: 50 },
    { subject: "Coding", kind: "mid2", score: 45, max: 50 },
    { subject: "Coding", kind: "continuous", score: 9, max: 10 },
  ];

  it("predicts each subject from mid exams, continuous work, attendance and rating", () => {
    const r = resultPrediction({ student: base, exams, ratings: [{ subject: "", rating: 4 }] });
    const math = r.subjects.find((s) => s.subject === "Math");
    // mid = 0.4*40 + 0.6*30 = 34; ca = 50; att = 65; rating = 80
    // (35*34 + 25*50 + 25*65 + 15*80) / 100 = 52.65
    expect(math.predicted).toBeCloseTo(52.65, 1);
    expect(math.outlook).toBe("Watch");
    expect(math.detentionRisk).toBe(true);
    expect(math.classesToReach75).toBe(16); // (26 + x) / (40 + x) >= 0.75
    const coding = r.subjects.find((s) => s.subject === "Coding");
    expect(coding.outlook).toBe("Safe");
    expect(r.band).toBe("Watch");
    expect(r.predictedSgpa).toBeGreaterThan(0);
  });

  it("flags a subject predicted below the pass mark", () => {
    const r = resultPrediction({
      student: base,
      exams: [
        { subject: "Math", kind: "mid1", score: 8, max: 50 },
        { subject: "Math", kind: "mid2", score: 10, max: 50 },
        { subject: "Math", kind: "continuous", score: 3, max: 10 },
      ],
    });
    expect(r.subjects.find((s) => s.subject === "Math").outlook).toBe("At risk");
    expect(r.failedSubjects).toEqual(["Math"]);
  });

  it("uses graded LMS assignments as continuous assessment", () => {
    const r = resultPrediction({
      student: base,
      exams: exams.filter((e) => e.kind !== "continuous"),
      assignments: [{ subject: "Math", marks: 9, max: 10 }],
    });
    expect(
      r.subjects.find((s) => s.subject === "Math").components.find((c) => c.key === "continuous")
        .value,
    ).toBe(90);
  });

  it("needs at least a mid exam or continuous score to predict a subject", () => {
    const r = resultPrediction({ student: base });
    expect(r.band).toBe("Insufficient data");
    expect(r.subjects.every((s) => s.predicted === null)).toBe(true);
  });
});

describe("risk and actions", () => {
  it("is High when a subject is predicted to fail, with the reason", () => {
    const placement = { score: 70, band: "On track" };
    const result = { score: 45, band: "At risk", failedSubjects: ["Math"], detentionSubjects: [] };
    const risk = riskOf(placement, result);
    expect(risk.level).toBe("High");
    expect(risk.reasons[0]).toContain("Math");
  });

  it("is Low when both predictions are on track and Insufficient when there is no data", () => {
    expect(
      riskOf(
        { score: 80, band: "Placement-ready" },
        { score: 70, band: "Safe", failedSubjects: [], detentionSubjects: [] },
      ).level,
    ).toBe("Low");
    expect(riskOf({ score: null }, { score: null }).level).toBe("Insufficient data");
  });

  it("names specific, numbered actions with an owner and priority", () => {
    const out = predictStudent({
      student: student({
        cgpa: 7,
        mockInterviews: 0,
        resumeCompleteness: 40,
        skills: { ...emptyStudent.skills, aptitude: 45 },
        subjects: [{ subject: "Math", marks: 30, classesHeld: 40, classesAttended: 24 }],
      }),
      coding: { easy: 20, medium: 5, hard: 0 },
      exams: [
        { subject: "Math", kind: "mid1", score: 12, max: 50 },
        { subject: "Math", kind: "mid2", score: 14, max: 50 },
      ],
    });
    const text = out.actions.map((a) => a.title).join("\n");
    expect(out.risk.level).toBe("High");
    expect(text).toContain("more medium problems");
    expect(text).toContain("Attend the next");
    expect(text).toContain("Math");
    expect(out.actions[0].priority).toBe("high");
    expect(out.actions.every((a) => a.owner)).toBe(true);
  });
});
