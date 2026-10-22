import { describe, expect, it } from "vitest";

import { buildRows, byAttention, isAtRisk, lowAttendance, summarize } from "@/lib/campus-derive";
import { emptyStudent } from "@/lib/student-defaults";

const TODAY = "2026-10-10";
const rec = (id, patch = {}, link = {}) => ({
  id,
  owner_id: link.owner ?? null,
  faculty_id: link.faculty ?? null,
  mentor_name: link.mentorName ?? "",
  record: { ...emptyStudent, id, name: id, ...patch },
});
const strong = {
  cgpa: 9,
  subjects: [{ subject: "Maths", marks: 92, classesHeld: 40, classesAttended: 39 }],
};
const weak = {
  cgpa: 4,
  backlogs: 3,
  subjects: [{ subject: "Maths", marks: 30, classesHeld: 40, classesAttended: 20 }],
};

describe("buildRows", () => {
  it("skips records that fail the schema instead of crashing", () => {
    const bad = { id: "X", record: { id: "X" } };
    expect(buildRows([bad, rec("A")], TODAY).map((r) => r.id)).toEqual(["A"]);
  });

  it("leaves score, band and attendance empty for a student with no data", () => {
    const [row] = buildRows([rec("A")], TODAY);
    expect(row.score).toBeNull();
    expect(row.band).toBeNull();
    expect(row.attendance).toBeNull();
    expect(row.cgpa).toBeNull();
    expect(isAtRisk(row)).toBe(false);
    expect(lowAttendance(row)).toBe(false);
  });

  it("works out band, attendance and risk for real data", () => {
    const rows = buildRows([rec("S", strong), rec("W", weak)], TODAY);
    const [s, w] = rows;
    expect(s.band).toBe("On Track");
    expect(s.attendance).toBeCloseTo(97.5);
    expect(isAtRisk(w)).toBe(true);
    expect(lowAttendance(w)).toBe(true);
    expect(w.urgent).toBeGreaterThan(0);
  });

  it("carries the teacher and account names through", () => {
    const [row] = buildRows([rec("A", {}, { faculty: "t1", mentorName: "Dr Rao" })], TODAY);
    expect(row.mentorId).toBe("t1");
    expect(row.mentorName).toBe("Dr Rao");
  });
});

describe("byAttention", () => {
  it("puts the neediest first and students without data last", () => {
    const rows = buildRows([rec("none"), rec("strong", strong), rec("weak", weak)], TODAY);
    expect(byAttention(rows).map((r) => r.id)).toEqual(["weak", "strong", "none"]);
  });
});

describe("summarize", () => {
  it("counts bands, gaps and open work", () => {
    const rows = buildRows(
      [rec("none"), rec("strong", strong, { faculty: "t" }), rec("weak", weak, { faculty: "t" })],
      TODAY,
    );
    const interventions = [
      { status: "open", follow_up_date: "2026-10-01" },
      { status: "resolved", follow_up_date: "2026-09-01" },
      { status: "in-progress", follow_up_date: "2026-12-01" },
    ];
    const sum = summarize(rows, interventions, TODAY);
    expect(sum.total).toBe(3);
    expect(sum.withData).toBe(2);
    expect(sum.noData).toBe(1);
    expect(sum.unassigned).toBe(1);
    expect(sum.atRisk).toBe(1);
    expect(sum.openInterventions).toBe(2);
    expect(sum.overdueFollowUps).toBe(1);
    expect(sum.byBand["On Track"]).toBe(1);
    expect(sum.avgScore).not.toBeNull();
  });

  it("has no average when nobody has data", () => {
    expect(summarize(buildRows([rec("a")], TODAY), [], TODAY).avgScore).toBeNull();
  });
});
