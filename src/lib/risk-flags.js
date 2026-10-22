import { studentAttendancePct, lmsParts, componentScores } from "./scoring";
const subjectsBelow75 = (s) => {
  if (s.subjectsBelow75 !== undefined && s.subjectsBelow75 !== null) return s.subjectsBelow75;
  if (s.subjects.length === 0) return null;
  return s.subjects.filter((x) => x.classesHeld > 0 && x.classesAttended / x.classesHeld < 0.75)
    .length;
};
const sgpaDrop = (s) => {
  if (s.semesterGrades.length < 2) return null;
  return (s.semesterGrades[0] ?? 0) - (s.semesterGrades.at(-1) ?? 0);
};
// ---------- Academic Risk signals (High ≥ 5 pts, Medium ≥ 2 pts) ----------
export const ACADEMIC_SIGNALS = [
  {
    id: "backlogs",
    label: "Active backlogs",
    threshold: "Backlogs ≥ 1",
    evaluate: (s) => ({ fired: s.backlogs >= 1, value: String(s.backlogs), points: 3 }),
  },
  {
    id: "low-cgpa",
    label: "CGPA",
    threshold: "CGPA < 6.0",
    evaluate: (s) =>
      s.cgpa > 0 ? { fired: s.cgpa < 6.0, value: s.cgpa.toFixed(2), points: 3 } : null,
  },
  {
    id: "sgpa-drop",
    label: "SGPA drop vs last sem",
    threshold: "Drop ≥ 1.0",
    evaluate: (s) => {
      const d = sgpaDrop(s);
      return d === null ? null : { fired: d >= 1.0, value: d.toFixed(2), points: 2 };
    },
  },
  {
    id: "low-attendance",
    label: "Overall attendance %",
    threshold: "Attendance < 75%",
    evaluate: (s) => {
      const a = studentAttendancePct(s);
      return a === null ? null : { fired: a < 75, value: a.toFixed(1) + "%", points: 3 };
    },
  },
  {
    id: "subjects-below-75",
    label: "Subjects under 75% attendance",
    threshold: "≥ 1 subject (1 pt each, max 3)",
    evaluate: (s) => {
      const n = subjectsBelow75(s);
      if (n === null) return null;
      return { fired: n >= 1, value: String(n), points: Math.min(n, 3) };
    },
  },
  {
    id: "low-lessons",
    label: "LMS lesson completion %",
    threshold: "Lessons < 50%",
    evaluate: (s) => {
      const l = lmsParts(s).lessonsPct;
      return l === null ? null : { fired: l < 50, value: l.toFixed(0) + "%", points: 2 };
    },
  },
  {
    id: "low-assignments",
    label: "Assignment completion %",
    threshold: "Assignments < 60%",
    evaluate: (s) => {
      const a = lmsParts(s).assignmentPct;
      return a === null ? null : { fired: a < 60, value: a.toFixed(0) + "%", points: 1 };
    },
  },
];
// ---------- Placement Risk signals (High ≥ 6 pts, Medium ≥ 3 pts) ----------
export const PLACEMENT_SIGNALS = [
  {
    id: "low-readiness",
    label: "Placement readiness",
    threshold: "Readiness < 60%",
    evaluate: (s) => {
      const p = componentScores(s).placement;
      return p === null ? null : { fired: p < 60, value: p.toFixed(0) + "%", points: 3 };
    },
  },
  {
    id: "weak-aptitude",
    label: "Aptitude score",
    threshold: "Aptitude < 50",
    evaluate: (s) =>
      s.skills.aptitude >= 0
        ? { fired: s.skills.aptitude < 50, value: String(s.skills.aptitude), points: 2 }
        : null,
  },
  {
    id: "weak-coding",
    label: "Coding score",
    threshold: "Coding < 50",
    evaluate: (s) =>
      s.skills.coding >= 0
        ? { fired: s.skills.coding < 50, value: String(s.skills.coding), points: 2 }
        : null,
  },
  {
    id: "weak-resume",
    label: "Resume completeness %",
    threshold: "Resume < 70%",
    evaluate: (s) =>
      s.resumeCompleteness >= 0
        ? { fired: s.resumeCompleteness < 70, value: s.resumeCompleteness + "%", points: 1 }
        : null,
  },
  {
    id: "no-mock-interviews",
    label: "Mock interviews",
    threshold: "0 completed",
    evaluate: (s) =>
      s.mockInterviews !== undefined && s.mockInterviews >= 0
        ? { fired: s.mockInterviews === 0, value: String(s.mockInterviews), points: 2 }
        : null,
  },
  {
    id: "low-assessments",
    label: "Assessments completed %",
    threshold: "Completed < 50%",
    evaluate: (s) =>
      s.assessmentsRequired > 0
        ? {
            fired: (s.assessmentsCompleted / s.assessmentsRequired) * 100 < 50,
            value: `${s.assessmentsCompleted}/${s.assessmentsRequired}`,
            points: 1,
          }
        : null,
  },
  {
    id: "no-certs-hackathons",
    label: "Certifications + hackathons",
    threshold: "0 total",
    evaluate: (s) => {
      if (s.hasEngagementData === false) return null;
      const n = s.engagement.filter(
        (e) => e.type === "certification" || e.type === "hackathon",
      ).length;
      return { fired: n === 0, value: String(n), points: 1 };
    },
  },
];
/** Level thresholds per flag (from the official rule set). */
export const FLAG_LEVELS = {
  academic: { high: 5, medium: 2 },
  placement: { high: 6, medium: 3 },
};
function computeFlag(s, signals, levels) {
  const drivers = [];
  const insufficient = [];
  let points = 0;
  for (const sig of signals) {
    const r = sig.evaluate(s);
    if (r === null) {
      insufficient.push(sig.label);
      continue;
    }
    if (r.fired) {
      points += r.points;
      drivers.push({
        signal: sig.label,
        value: r.value,
        threshold: sig.threshold,
        points: r.points,
      });
    }
  }
  drivers.sort((a, b) => b.points - a.points);
  const level =
    insufficient.length === signals.length
      ? "Insufficient data"
      : points >= levels.high
        ? "High"
        : points >= levels.medium
          ? "Medium"
          : "Low";
  return { level, points, drivers, insufficient };
}
export function academicRisk(s) {
  return computeFlag(s, ACADEMIC_SIGNALS, FLAG_LEVELS.academic);
}
export function placementRisk(s) {
  return computeFlag(s, PLACEMENT_SIGNALS, FLAG_LEVELS.placement);
}
/** Overall band rule: any High flag means the band cannot be On Track. */
export function effectiveBand(score, baseBand, academic, placement) {
  if (score === null || baseBand === null) return baseBand;
  if (baseBand === "On Track" && (academic.level === "High" || placement.level === "High"))
    return "Monitor";
  return baseBand;
}
