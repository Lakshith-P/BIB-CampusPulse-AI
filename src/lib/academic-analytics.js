import { classesNeededForTarget, studentAttendancePct } from "@/lib/scoring";

// Forward-looking analysis of one student's own record. Every figure is derived from marks,
// semester grades and attendance already stored; projections are trend extrapolations, labelled
// as such, never guarantees.

const ok = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const round = (value, places = 1) => Number(value.toFixed(places));
const TOTAL_SEMESTERS = 8;

/** Least-squares line through (index, grade); the slope is the change per semester. */
export function trendOf(grades) {
  const n = grades.length;
  if (n < 2) return null;
  const xs = grades.map((_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = grades.reduce((a, b) => a + b, 0) / n;
  const sxx = xs.reduce((a, x) => a + (x - meanX) ** 2, 0);
  const slope = xs.reduce((a, x, i) => a + (x - meanX) * (grades[i] - meanY), 0) / sxx;
  const intercept = meanY - slope * meanX;
  const residual = Math.sqrt(
    grades.reduce((a, y, i) => a + (y - (intercept + slope * i)) ** 2, 0) / n,
  );
  return { slope, intercept, residual };
}

export function analyzeAcademics(student, { targetCgpa } = {}) {
  const grades = (student.semesterGrades ?? []).filter(ok);
  const cgpa = ok(student.cgpa) && student.cgpa > 0 ? student.cgpa : null;
  const semester = Number(student.semester) || grades.length + 1;
  const completed = grades.length;
  const remaining = Math.max(0, TOTAL_SEMESTERS - completed);
  const attendance = studentAttendancePct(student);

  const subjects = (student.subjects ?? []).map((subject) => {
    const held = subject.classesHeld > 0 ? subject.classesHeld : 0;
    const pct = held ? (subject.classesAttended / held) * 100 : null;
    return {
      subject: subject.subject,
      marks: ok(subject.marks) ? subject.marks : null,
      attendance: pct === null ? null : round(pct),
      classesToReach75:
        held && pct < 75 ? classesNeededForTarget(subject.classesAttended, held, 75) : 0,
      band: !ok(subject.marks)
        ? "unknown"
        : subject.marks < 40
          ? "failing"
          : subject.marks < 55
            ? "weak"
            : subject.marks < 75
              ? "steady"
              : "strong",
    };
  });
  const ranked = subjects.filter((s) => s.marks !== null).sort((a, b) => a.marks - b.marks);

  const line = trendOf(grades);
  let projection = null;
  if (line) {
    const next = Math.min(10, Math.max(0, line.intercept + line.slope * grades.length));
    const spread = Math.max(0.3, line.residual * 1.5);
    projection = {
      nextSgpa: round(next, 2),
      low: round(Math.max(0, next - spread), 2),
      high: round(Math.min(10, next + spread), 2),
      direction: line.slope > 0.15 ? "improving" : line.slope < -0.15 ? "declining" : "flat",
      perSemester: round(line.slope, 2),
      basis: `Straight-line trend over ${grades.length} semester grades; a projection, not a guarantee.`,
      projectedCgpa: cgpa === null ? null : round((cgpa * completed + next) / (completed + 1), 2),
    };
  }

  const defaultTarget = cgpa === null ? null : Math.min(9.5, Math.ceil((cgpa + 0.4) * 10) / 10);
  const target = ok(targetCgpa) && targetCgpa > 0 && targetCgpa <= 10 ? targetCgpa : defaultTarget;
  let targetPlan = null;
  if (target !== null && cgpa !== null && remaining > 0) {
    // Equal credits per semester are assumed; the platform stores only the semester grades.
    const needed = (target * TOTAL_SEMESTERS - cgpa * completed) / remaining;
    targetPlan = {
      target,
      remainingSemesters: remaining,
      requiredAverageSgpa: round(needed, 2),
      reachable: needed <= 10,
      comparedWithLatest: grades.length ? round(needed - grades.at(-1), 2) : null,
    };
  }

  return {
    cgpa,
    semester,
    completedSemesters: completed,
    semesterGrades: grades,
    latestSgpa: grades.at(-1) ?? null,
    backlogs: student.backlogs ?? 0,
    attendance: attendance === null ? null : round(attendance),
    subjects,
    weakest: ranked.slice(0, 3),
    strongest: ranked.slice(-2).reverse(),
    lowAttendance: subjects
      .filter((s) => s.attendance !== null && s.attendance < 75)
      .sort((a, b) => a.attendance - b.attendance),
    projection,
    targetPlan,
  };
}

/** The numbers an academic run is compared with next time, to say what changed. */
export const academicSnapshot = (analysis) => ({
  cgpa: analysis.cgpa,
  latestSgpa: analysis.latestSgpa,
  attendance: analysis.attendance,
  backlogs: analysis.backlogs,
  marks: Object.fromEntries(
    analysis.subjects.filter((s) => s.marks !== null).map((s) => [s.subject, s.marks]),
  ),
  subjectAttendance: Object.fromEntries(
    analysis.subjects.filter((s) => s.attendance !== null).map((s) => [s.subject, s.attendance]),
  ),
});

const delta = (now, before) =>
  typeof now === "number" && typeof before === "number" ? round(now - before, 2) : null;

/** Plain sentences describing what moved since the previous run (empty on the first run). */
export function academicChanges(before, after) {
  if (!before) return [];
  const out = [];
  const line = (label, now, prev, unit = "") => {
    const d = delta(now, prev);
    if (d !== null && d !== 0)
      out.push(`${label} ${d > 0 ? "rose" : "fell"} from ${prev}${unit} to ${now}${unit}.`);
  };
  line("CGPA", after.cgpa, before.cgpa);
  line("Latest SGPA", after.latestSgpa, before.latestSgpa);
  line("Overall attendance", after.attendance, before.attendance, "%");
  if (after.backlogs !== before.backlogs)
    out.push(`Backlogs changed from ${before.backlogs} to ${after.backlogs}.`);
  for (const [subject, marks] of Object.entries(after.marks))
    line(`${subject} marks`, marks, before.marks?.[subject]);
  for (const [subject, pct] of Object.entries(after.subjectAttendance))
    line(`${subject} attendance`, pct, before.subjectAttendance?.[subject], "%");
  return out;
}
