import { describe, expect, it } from "vitest";
import {
  byBranch,
  dataQuality,
  filterRows,
  interventionProgress,
  riskSegmentation,
  scoreDistribution,
  semesterTrend,
} from "@/lib/analytics";
import { buildRows } from "@/lib/campus-derive";
import { emptyStudent } from "@/lib/student-defaults";

const rec = (id, over, faculty = "t1") => ({
  owner_id: `o-${id}`,
  faculty_id: faculty,
  record: { ...emptyStudent, id, name: id, ...over },
});
const subjects = (att, held = 40) => [
  {
    subject: "Maths",
    marks: 70,
    classesHeld: held,
    classesAttended: Math.round((att / 100) * held),
  },
];
const rows = buildRows(
  [
    rec("A", { branch: "CSE", semester: 1, cgpa: 9, semesterGrades: [9], subjects: subjects(95) }),
    rec("B", {
      branch: "CSE",
      semester: 3,
      cgpa: 5,
      backlogs: 2,
      semesterGrades: [7, 6, 5],
      subjects: subjects(60),
    }),
    rec("C", { branch: "ECE", semester: 5, cgpa: 0 }, null),
  ],
  "2026-10-21",
);

describe("admin analytics", () => {
  it("filters by branch, year of study, cohort and band", () => {
    expect(filterRows(rows, { branch: "CSE" }).map((r) => r.id)).toEqual(["A", "B"]);
    expect(filterRows(rows, { year: 2 }).map((r) => r.id)).toEqual(["B"]);
    expect(filterRows(rows, { band: "nodata" }).map((r) => r.id)).toContain("C");
    expect(filterRows(rows, { branch: "CSE", year: 1 }).map((r) => r.id)).toEqual(["A"]);
  });

  it("counts students per band and keeps no-data students separate", () => {
    const d = scoreDistribution(rows);
    expect(d.bands.reduce((a, b) => a + b.count, 0) + d.noData).toBe(3);
    expect(d.noData).toBe(1);
  });

  it("compares branches without counting missing values as zero", () => {
    const b = byBranch(rows);
    expect(b.map((x) => x.branch)).toEqual(["CSE", "ECE"]);
    expect(b[0].attendance).toBeCloseTo((95 + 60) / 2, 0);
    expect(b[1].score).toBeNull();
  });

  it("averages SGPA per semester from what is recorded", () => {
    const t = semesterTrend(rows);
    expect(t[0]).toMatchObject({ semester: 1, students: 2 });
    expect(t[0].sgpa).toBeCloseTo(8);
    expect(t.at(-1).semester).toBe(3);
  });

  it("lists the students behind each risk level", () => {
    const [academic] = riskSegmentation(rows);
    const high = academic.levels.find((l) => l.level === "High");
    expect(high.students.map((s) => s.id)).toEqual(["B"]);
  });

  it("reports coverage and data-quality alerts", () => {
    const q = dataQuality(rows);
    expect(q.coverage.find((c) => c.key === "attendance").have).toBe(2);
    expect(q.alerts.some((a) => a.text.includes("no attendance"))).toBe(true);
    expect(q.alerts.some((a) => a.text.includes("no teacher"))).toBe(true);
  });

  it("summarises support actions for the students in view only", () => {
    const interventions = [
      { id: "1", student_id: "A", status: "open", follow_up_date: "2026-10-01", outcome: "" },
      {
        id: "2",
        student_id: "B",
        status: "resolved",
        follow_up_date: "2026-09-01",
        outcome: "Back on track",
      },
      {
        id: "3",
        student_id: "C",
        status: "in-progress",
        follow_up_date: "2026-12-01",
        outcome: "",
      },
    ];
    const p = interventionProgress(
      interventions,
      filterRows(rows, { branch: "CSE" }),
      "2026-10-21",
    );
    expect(p).toMatchObject({ total: 2, open: 1, resolved: 1, overdue: 1 });
    expect(p.resolutionRate).toBe(50);
    expect(p.outcomes[0].outcome).toBe("Back on track");
  });
});
