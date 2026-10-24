// Plain-wording answers built straight from what the lookups returned. Used when no language model
// can be reached (quota spent, key revoked), so Pluto still answers the question with the person's
// own figures instead of failing. Each function reads one lookup's result.

const pc = (v) => (v === null || v === undefined ? "n/a" : `${v}%`);
const n = (v, d = "n/a") => (v === null || v === undefined ? d : v);
const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
const names = (items, max = 6) =>
  items
    .slice(0, max)
    .map((s) => s.name || s.subject || s.student)
    .join(", ");

const studentLine = (s) =>
  `${s.name} (${s.id}, ${s.branch}): Success Score ${n(s.successScore)} ${s.band ? `(${s.band})` : ""}, CGPA ${n(s.cgpa)}, attendance ${pc(s.attendance)}${s.subjectsBelow75Attendance?.length ? `, under 75% in ${s.subjectsBelow75Attendance.join(", ")}` : ""}${s.backlogs ? `, ${plural(s.backlogs, "backlog")}` : ""}`;

const FORMATTERS = {
  my_overview: (o) =>
    `You are at a Success Score of ${n(o.successScore)}${o.band ? ` (${o.band})` : ""}, with CGPA ${n(o.cgpa)}, latest SGPA ${n(o.latestSgpa)} and ${pc(o.attendance)} attendance${o.backlogs ? `, and ${plural(o.backlogs, "backlog")}` : ""}. Academic risk is ${o.academicRisk} and placement risk is ${o.placementRisk}${o.biggestRiskSignal ? `; the main risk signal is ${o.biggestRiskSignal}` : ""}.`,

  my_subjects: (o) => {
    const subjects = o.subjects;
    if (!subjects.length) return "No subjects are recorded for you yet.";
    const weakest = subjects[0];
    const short = subjects
      .filter((s) => s.attendance !== null && s.attendance < 75)
      .sort((a, b) => a.attendance - b.attendance);
    return `Your lowest marks are in ${weakest.subject} (${n(weakest.marks)}). ${
      short.length
        ? `Attendance is below 75% in ${short.map((s) => `${s.subject} (${s.attendance}%, attend the next ${s.classesNeededToReach75} classes)`).join("; ")}.`
        : "Attendance is at least 75% in every subject."
    }`;
  },

  my_attention: (o) => {
    const parts = [];
    if (o.alerts.length)
      parts.push(
        `Needs attention: ${o.alerts
          .slice(0, 3)
          .map((a) => `${a.issue} (${a.advice})`)
          .join("; ")}.`,
      );
    if (o.pendingAssignments.length)
      parts.push(
        `Pending work: ${o.pendingAssignments
          .slice(0, 3)
          .map(
            (a) =>
              `${a.title} in ${a.subject}${a.daysLeft !== null ? `, due in ${a.daysLeft} day(s)` : ""}`,
          )
          .join("; ")}.`,
      );
    if (o.nextSteps.length) parts.push(`Next steps: ${o.nextSteps.slice(0, 3).join(" ")}`);
    return parts.join(" ") || "Nothing needs attention right now.";
  },

  my_predictions: (o) =>
    `Your overall risk level is ${o.riskLevel}${o.riskReasons.length ? `: ${o.riskReasons.slice(0, 2).join(" ")}` : ""} Predicted placement score is ${n(o.placement.score)}/100 (${o.placement.band})${o.placement.projectedInWeeks ? `, heading to ${o.placement.projectedInWeeks.score} in ${o.placement.projectedInWeeks.weeks} weeks` : ""}; predicted SGPA is ${n(o.result.predictedSgpa)} (${o.result.band}).${
      o.placement.improveFirst.length
        ? ` To raise placement fastest, work on ${o.placement.improveFirst.map((i) => `${i.criterion} (up to +${i.possibleGain} points)`).join(", ")}.`
        : ""
    }${o.recommendedActions.length ? ` First action: ${o.recommendedActions[0].action}` : ""}`,

  my_placement: (o) => {
    const drives = o.openDrives;
    const eligible = drives.filter((d) => d.eligible);
    return `Resume ${typeof o.resumeCompletenessPercent === "number" ? `${o.resumeCompletenessPercent}% complete` : o.resumeCompletenessPercent}, ${o.mockInterviews} mock interview(s), placement risk ${o.placementRisk}. ${
      drives.length
        ? `${plural(drives.length, "drive")} open; you are eligible for ${eligible.length ? eligible.map((d) => `${d.company} (${d.role})`).join(", ") : "none right now"}${drives.find((d) => !d.eligible && d.why) ? `. ${drives.find((d) => !d.eligible && d.why).company}: ${drives.find((d) => !d.eligible && d.why).why}` : ""}.`
        : "No company drives are open right now."
    }`;
  },

  my_support: (o) =>
    o.supportActions.length
      ? `Support actions for you: ${o.supportActions.map((a) => `${a.action} (${a.status}, follow-up ${a.followUp})`).join("; ")}.`
      : "No support actions have been created for you.",

  class_overview: (o) =>
    `${o.scope.students} students${o.scope.branch !== "all" ? ` in ${o.scope.branch}` : ""}${o.scope.year !== "all" ? `, year ${o.scope.year}` : ""}: average Success Score ${n(o.averageSuccessScore)}, average CGPA ${n(o.averageCgpa)}, average attendance ${pc(o.averageAttendance)}. ${o.atRisk} at risk, ${o.studentsWithAnySubjectBelow75} with attendance under 75% in some subject, ${o.openInterventions} open support actions (${o.overdueFollowUps} overdue).`,

  find_students: (o) =>
    o.totalMatching
      ? `${plural(o.totalMatching, "student")} match${o.totalMatching === 1 ? "es" : ""}. ${o.students.slice(0, 6).map(studentLine).join(" | ")}`
      : "No students match that.",

  student_detail: (o) => {
    if (o.error) return o.error;
    if (o.matches)
      return `Several students match: ${o.matches.map((m) => `${m.name} (${m.id})`).join(", ")}. Which one?`;
    const weakest = [...o.subjects].sort((a, b) => (a.marks ?? 101) - (b.marks ?? 101))[0];
    return `${studentLine(o)}. Predicted risk: ${o.predictions.riskLevel}${o.predictions.riskReasons[0] ? ` (${o.predictions.riskReasons[0]})` : ""}.${weakest ? ` Weakest subject: ${weakest.subject} (${n(weakest.marks)}).` : ""}${o.predictions.recommendedActions[0] ? ` Suggested action: ${o.predictions.recommendedActions[0].action} (owner: ${o.predictions.recommendedActions[0].owner}).` : ""}${o.supportActions.length ? ` ${plural(o.supportActions.length, "support action")} on file.` : ""}`;
  },

  predicted_risk: (o) =>
    `Predicted risk: ${o.counts.High} high, ${o.counts.Medium} medium, ${o.counts.Low} low. Highest first: ${o.students
      .slice(0, 5)
      .map((s) => `${s.name} (${s.id}, ${s.riskLevel}${s.why[0] ? `: ${s.why[0]}` : ""})`)
      .join(" | ")}`,

  support_actions: (o) =>
    o.total
      ? `${plural(o.total, "support action")}${o.supportActions.some((a) => a.overdue) ? `, ${o.supportActions.filter((a) => a.overdue).length} overdue` : ""}: ${o.supportActions
          .slice(0, 6)
          .map(
            (a) =>
              `${a.student} - ${a.action} (${a.status}, follow-up ${a.followUp}${a.overdue ? ", overdue" : ""})`,
          )
          .join("; ")}.`
      : "There are no support actions matching that.",

  department_comparison: (o) =>
    o.departments
      .map(
        (d) =>
          `${d.branch}: ${d.students} students, Success Score ${n(d.averageSuccessScore)}, CGPA ${n(d.averageCgpa)}, attendance ${pc(d.averageAttendance)}, ${d.atRisk} at risk, ${d.predictedHighRisk} predicted high risk`,
      )
      .join(" | "),

  teacher_workload: (o) =>
    o.teachers
      .map(
        (t) =>
          `${t.teacher}: ${t.students} students, ${t.atRisk} at risk, ${t.openActions} open actions (${t.overdueActions} overdue)`,
      )
      .join(" | "),
};

/** The answer to a question from the lookups that were run for it: [{ tool, output | error }]. */
export function answerFromData(results) {
  const lines = results.map((r) => {
    if (r.error) return null;
    if (r.output?.error) return r.output.error;
    const f = FORMATTERS[r.tool];
    try {
      return f ? f(r.output) : null;
    } catch {
      return null;
    }
  });
  return (
    lines.filter(Boolean).join("\n\n").slice(0, 1800) ||
    "I could not find anything on that in the records you can see."
  );
}

export const MODEL_DOWN_NOTE =
  "(The AI model is unavailable right now, so this is read straight from the records.)";

/** For a signed-out visitor when no model can answer: a short, honest answer about the product. */
export function visitorFallback(question) {
  const q = String(question ?? "").toLowerCase();
  if (/score|band|weight|success/.test(q))
    return "The Success Score runs from 0 to 100 and combines six indicators: academics 30, attendance 20, LMS 15, placement 15, engagement 10 and skills 10. 80 and above is On Track, 65-79 Monitor, 50-64 Needs Attention, and below 50 High Priority. Missing data is shown as missing, never as zero.";
  if (/privacy|secure|safe|data/.test(q))
    return "Each person sees only their own records or the students assigned to them, and administrators see everything. Roles are checked on the server for every request. See [Privacy](/privacy) for details.";
  if (/workspace|teacher|student|admin|feature|offer/.test(q))
    return "Students see their own results, attendance, risk, predictions and placement readiness. Teachers see the students assigned to them, who needs help and what to do. Administrators see the whole campus. [Sign in](/auth) to open your workspace.";
  if (/marks|attendance|my |grade|cgpa/.test(q))
    return "I can only see your own records once you are signed in. [Sign in](/auth) and ask again.";
  return "I can explain the Success Score, the three workspaces and privacy. Try asking what the score measures or what each workspace offers.";
}
