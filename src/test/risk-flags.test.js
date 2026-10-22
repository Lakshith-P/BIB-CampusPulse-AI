import { describe, it, expect } from "vitest";
import {
  academicRisk,
  placementRisk,
  effectiveBand,
  ACADEMIC_SIGNALS,
  PLACEMENT_SIGNALS,
} from "@/lib/risk-flags";
function baseStudent(overrides = {}) {
  return {
    id: "T-1",
    name: "Test",
    branch: "CSE",
    semester: 5,
    gradYear: 2027,
    mentorId: "FAC-01",
    cgpa: 8.5,
    semesterGrades: [8.5, 8.2],
    backlogs: 0,
    subjects: [{ subject: "Math", marks: 85, classesHeld: 40, classesAttended: 38 }],
    lms: [
      {
        subject: "Math",
        units: [
          {
            unit: 1,
            title: "U1",
            lessons: [{ title: "L1", completed: true, resource: "" }],
            assignment: { title: "A1", deadline: "2026-11-01", submitted: true, marks: 90 },
          },
        ],
      },
    ],
    skills: { coding: 80, aptitude: 70, analytical: 70, verbal: 70, communication: 70 },
    engagement: [{ type: "hackathon", name: "H", date: "2026-09-01", verified: true }],
    resumeCompleteness: 90,
    mockInterviews: 2,
    targetRoles: [],
    assessmentsCompleted: 3,
    assessmentsRequired: 3,
    facultyFeedback: [],
    studentFeedback: [],
    ...overrides,
  };
}
describe("risk flags (official rule table)", () => {
  it("healthy student scores Low with zero points and no drivers", () => {
    const a = academicRisk(baseStudent());
    expect(a.level).toBe("Low");
    expect(a.points).toBe(0);
    expect(a.drivers).toHaveLength(0);
  });
  it("backlogs + low CGPA + low attendance reach High with sorted drivers", () => {
    const s = baseStudent({
      cgpa: 5.5,
      backlogs: 2,
      subjects: [{ subject: "Math", marks: 50, classesHeld: 40, classesAttended: 20 }],
    });
    const a = academicRisk(s);
    // backlogs 3 + cgpa 3 + attendance 3 + subjects-below-75 1 = 10
    expect(a.points).toBe(10);
    expect(a.level).toBe("High"); // ≥ 5
    expect(a.drivers.map((d) => d.points)).toEqual([3, 3, 3, 1]);
  });
  it("missing inputs add no points; fully missing flag is Insufficient data", () => {
    const s = baseStudent({ cgpa: 0, subjects: [], semesterGrades: [], lms: [] });
    const a = academicRisk(s);
    expect(a.points).toBe(0); // backlogs known but not fired; everything else missing
    expect(a.insufficient).toContain("CGPA");
    expect(a.insufficient).toContain("Overall attendance %");
    const empty = academicRisk({ ...s, backlogs: 0 });
    expect(empty.level).toBe("Low"); // backlogs known, rest missing
  });
  it("placement flag: weak readiness + no mocks + weak coding reach High", () => {
    const s = baseStudent({
      resumeCompleteness: 50,
      mockInterviews: 0,
      assessmentsCompleted: 0,
      assessmentsRequired: 4,
      skills: { coding: 40, aptitude: 60, analytical: 50, verbal: 60, communication: 60 },
    });
    const p = placementRisk(s);
    // readiness (resume 50*0.4 + assess 0*0.3 + mock 0*0.3 = 20 < 60) 3 + coding 2 + resume 1 + mocks 2 + assessments 1 = 9
    expect(p.points).toBe(9);
    expect(p.level).toBe("High"); // ≥ 6
  });
  it("a High flag prevents the On Track band", () => {
    const high = { level: "High", points: 6, drivers: [], insufficient: [] };
    const low = { level: "Low", points: 0, drivers: [], insufficient: [] };
    expect(effectiveBand(85, "On Track", high, low)).toBe("Monitor");
    expect(effectiveBand(85, "On Track", low, low)).toBe("On Track");
    expect(effectiveBand(55, "Needs Attention", high, low)).toBe("Needs Attention");
  });
  it("config tables expose label, threshold and evaluation for every rule", () => {
    for (const sig of [...ACADEMIC_SIGNALS, ...PLACEMENT_SIGNALS]) {
      expect(sig.label).toBeTruthy();
      expect(sig.threshold).toBeTruthy();
      expect(typeof sig.evaluate).toBe("function");
    }
  });
});
