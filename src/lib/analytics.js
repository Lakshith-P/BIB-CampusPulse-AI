import { BAND_ORDER } from "./campus-derive";
import { componentScores } from "./scoring";

// Aggregations for the administrator analytics. Every figure is computed from the rows passed in
// (the filtered student list), so charts and tables always agree with the filters.

const mean = (values) => {
  const v = values.filter((x) => x !== null && x !== undefined);
  return v.length ? v.reduce((a, c) => a + c, 0) / v.length : null;
};

export const COMPONENTS = [
  ["academics", "Academics"],
  ["attendance", "Attendance"],
  ["lms", "LMS"],
  ["engagement", "Engagement"],
  ["skills", "Skills"],
  ["placement", "Placement"],
];

/** Keeps the rows that match every chosen filter. Empty or 0 means "any". */
export function filterRows(rows, { branch = "", year = 0, cohort = 0, band = "" } = {}) {
  return rows.filter(
    (r) =>
      (!branch || r.branch === branch) &&
      (!year || r.year === year) &&
      (!cohort || r.s.gradYear === cohort) &&
      (!band || (band === "nodata" ? r.band === null : r.band === band)),
  );
}

export function scoreDistribution(rows) {
  const counts = Object.fromEntries(BAND_ORDER.map((b) => [b, 0]));
  let noData = 0;
  for (const r of rows) {
    if (r.band === null) noData += 1;
    else counts[r.band] += 1;
  }
  return {
    bands: [...BAND_ORDER].reverse().map((band) => ({ band, count: counts[band] })),
    noData,
  };
}

export function byBranch(rows) {
  return [...new Set(rows.map((r) => r.branch))].sort().map((branch) => {
    const list = rows.filter((r) => r.branch === branch);
    const comps = list.map((r) => componentScores(r.s));
    return {
      branch,
      students: list.length,
      score: mean(list.map((r) => r.score)),
      cgpa: mean(list.map((r) => r.cgpa)),
      attendance: mean(list.map((r) => r.attendance)),
      lms: mean(list.map((r) => r.lms)),
      placement: mean(comps.map((c) => c.placement)),
      atRisk: list.filter((r) => r.band === "High Priority" || r.band === "Needs Attention").length,
    };
  });
}

/** Average SGPA of semester 1, 2, 3...; semesters nobody has recorded are left out. */
export function semesterTrend(rows) {
  const out = [];
  for (let i = 0; i < 8; i++) {
    const values = rows.map((r) => r.s.semesterGrades[i]).filter((g) => g !== undefined && g > 0);
    if (values.length) out.push({ semester: i + 1, sgpa: mean(values), students: values.length });
  }
  return out;
}

/** Students per risk level, for academic and placement risk separately, with who is in each. */
export function riskSegmentation(rows) {
  const make = (key, label) => ({
    key,
    label,
    levels: ["High", "Medium", "Low", "Insufficient data"].map((level) => ({
      level,
      students: rows.filter((r) => r[key] === level),
    })),
  });
  return [make("academicRisk", "Academic risk"), make("placementRisk", "Placement risk")];
}

/** How many students have each data source recorded, and what is missing or odd. */
export function dataQuality(rows) {
  const total = rows.length;
  const comps = rows.map((r) => componentScores(r.s));
  const coverage = COMPONENTS.map(([key, label]) => {
    const have = comps.filter((c) => c[key] !== null).length;
    return { key, label, have, pct: total ? (have / total) * 100 : 0 };
  });
  const alerts = [];
  for (const c of coverage)
    if (total && c.have < total)
      alerts.push({
        key: c.key,
        text: `${total - c.have} of ${total} students have no ${c.label.toLowerCase()} data yet`,
        severity: c.pct < 50 ? "high" : "medium",
      });
  const unassigned = rows.filter((r) => !r.mentorId).length;
  if (unassigned)
    alerts.push({
      key: "teacher",
      text: `${unassigned} student(s) have no teacher assigned`,
      severity: "medium",
    });
  const odd = rows.filter((r) => r.s.cgpa >= 8 && r.attendance !== null && r.attendance < 60);
  if (odd.length)
    alerts.push({
      key: "mismatch",
      text: `${odd.length} student(s) combine CGPA 8+ with attendance under 60%. Check the attendance records`,
      severity: "medium",
    });
  return { coverage, alerts };
}

/** Support actions for the students in view: how many are open, in progress or resolved. */
export function interventionProgress(interventions, rows, today) {
  const ids = new Set(rows.map((r) => r.id));
  const list = interventions.filter((i) => ids.has(i.student_id));
  const count = (status) => list.filter((i) => i.status === status).length;
  const open = list.filter((i) => i.status !== "resolved");
  return {
    total: list.length,
    open: count("open"),
    inProgress: count("in-progress"),
    resolved: count("resolved"),
    overdue: open.filter((i) => i.follow_up_date < today).length,
    resolutionRate: list.length ? (count("resolved") / list.length) * 100 : null,
    outcomes: list
      .filter((i) => i.status === "resolved" && i.outcome)
      .slice(0, 5)
      .map((i) => ({ id: i.id, studentId: i.student_id, outcome: i.outcome })),
  };
}
