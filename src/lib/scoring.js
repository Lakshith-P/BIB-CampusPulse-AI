import { DEFAULT_WEIGHTS, riskBand } from "./types";
// ---------- Attendance ----------
export function attendancePct(attended, held) {
  if (held <= 0) return null; // missing data is not zero
  return (attended / held) * 100;
}
export function studentAttendancePct(s) {
  const held = s.subjects.reduce((a, x) => a + x.classesHeld, 0);
  const att = s.subjects.reduce((a, x) => a + x.classesAttended, 0);
  return attendancePct(att, held);
}
// Configurable marks bands
export const ATTENDANCE_BANDS = [
  { min: 90, marks: 5 },
  { min: 85, marks: 4 },
  { min: 80, marks: 3 },
  { min: 75, marks: 2 },
  { min: 0, marks: 0 },
];
export function attendanceMarks(pct) {
  if (pct === null) return null;
  for (const b of ATTENDANCE_BANDS) if (pct >= b.min) return b.marks;
  return 0;
}
// Classes required to reach target% (must attend every future class). Integer arithmetic keeps
// results exact: (attended + x) / (held + x) >= target / 100  =>  x >= (target*held - 100*attended) / (100 - target)
export function classesNeededForTarget(attended, held, target) {
  if (attended * 100 >= target * held) return 0;
  if (target >= 100) return Infinity;
  return Math.ceil((target * held - 100 * attended) / (100 - target));
}
// Max additional classes that can be missed while staying >= target:
// attended / (held + x) >= target / 100  =>  x <= (100*attended - target*held) / target
export function maxMissableClasses(attended, held, target) {
  return Math.max(0, Math.floor((100 * attended - target * held) / target));
}
// ---------- LMS ----------
export function lmsCompletion(s) {
  let total = 0;
  let done = 0;
  for (const sub of s.lms) {
    for (const u of sub.units) {
      for (const l of u.lessons) {
        total++;
        if (l.completed) done++;
      }
      total++;
      if (u.assignment.submitted) done++;
    }
  }
  return total === 0 ? null : (done / total) * 100;
}
export function pendingAssignments(s) {
  return s.lms.flatMap((sub) =>
    sub.units
      .filter((u) => !u.assignment.submitted)
      .map((u) => ({ subject: sub.subject, ...u.assignment })),
  );
}
// LMS split into lesson-completion % and assignment-completion % (official rule set)
export function lmsParts(s) {
  let lessonsTotal = 0,
    lessonsDone = 0,
    assignTotal = 0,
    assignDone = 0;
  for (const sub of s.lms) {
    for (const u of sub.units) {
      for (const l of u.lessons) {
        lessonsTotal++;
        if (l.completed) lessonsDone++;
      }
      if (u.assignment.title === "—") continue; // placeholder on lesson-only units
      assignTotal++;
      if (u.assignment.submitted) assignDone++;
    }
  }
  return {
    lessonsPct: lessonsTotal === 0 ? null : (lessonsDone / lessonsTotal) * 100,
    assignmentPct: assignTotal === 0 ? null : (assignDone / assignTotal) * 100,
  };
}
// ---------- Component scores (each 0-100, null when data missing) ----------
// Formulas mirror the dataset's official scoring.py so the app reproduces the answer key.
export function componentScores(s) {
  const academics = s.cgpa > 0 ? s.cgpa * 10 : null;
  const attendance = studentAttendancePct(s);
  const { lessonsPct, assignmentPct } = lmsParts(s);
  const lmsPartsPresent = [lessonsPct, assignmentPct].filter((v) => v !== null);
  const lms =
    lmsPartsPresent.length === 0
      ? null
      : lmsPartsPresent.reduce((a, b) => a + b, 0) / lmsPartsPresent.length;
  const engCount = (t) => s.engagement.filter((e) => e.type === t).length;
  // null only when the engagement source is missing; a real zero stays zero
  const engagement =
    s.hasEngagementData === false ||
    (s.hasEngagementData === undefined && s.engagement.length === 0)
      ? null
      : Math.min(
          100,
          engCount("club") * 8 +
            engCount("event") * 4 +
            engCount("hackathon") * 12 +
            engCount("certification") * 10,
        );
  const sk = s.skills;
  const skillsVals = [sk.coding, sk.aptitude, sk.verbal, sk.communication].filter((v) => v >= 0);
  const skills =
    skillsVals.length === 0 ? null : skillsVals.reduce((a, b) => a + b, 0) / skillsVals.length;
  const assessmentPct =
    s.assessmentsRequired > 0 ? (s.assessmentsCompleted / s.assessmentsRequired) * 100 : null;
  const mockPct =
    s.mockInterviews !== undefined && s.mockInterviews >= 0
      ? Math.min(100, (s.mockInterviews / 3) * 100)
      : null;
  const plcParts = [
    [s.resumeCompleteness >= 0 ? s.resumeCompleteness : null, 0.4],
    [assessmentPct, 0.3],
    [mockPct, 0.3],
  ];
  const plcPresent = plcParts.filter((p) => p[0] !== null);
  const placement =
    plcPresent.length === 0
      ? null
      : plcPresent.reduce((a, [v, w]) => a + v * w, 0) / plcPresent.reduce((a, [, w]) => a + w, 0);
  return { academics, attendance, lms, engagement, skills, placement };
}
export function successScore(s, weights = DEFAULT_WEIGHTS) {
  const c = componentScores(s);
  const entries = Object.entries(c);
  const present = entries.filter(([, v]) => v !== null);
  const missing = entries.filter(([, v]) => v === null).map(([k]) => k);
  const completeness = (present.length / entries.length) * 100;
  if (present.length === 0) {
    return {
      score: null,
      completeness: 0,
      components: c,
      band: null,
      positives: [],
      negatives: [],
      missing,
    };
  }
  // Renormalize weights over available components — missing data is NOT zero
  const wSum = present.reduce((a, [k]) => a + weights[k], 0);
  const score = present.reduce((a, [k, v]) => a + (v * weights[k]) / wSum, 0);
  const positives = [];
  const negatives = [];
  if (c.academics !== null)
    (c.academics >= 80 ? positives : c.academics < 60 ? negatives : []).push(
      `CGPA ${s.cgpa.toFixed(2)}`,
    );
  if (c.attendance !== null)
    (c.attendance >= 85 ? positives : c.attendance < 75 ? negatives : []).push(
      `Attendance ${c.attendance.toFixed(1)}%`,
    );
  if (c.lms !== null)
    (c.lms >= 80 ? positives : c.lms < 50 ? negatives : []).push(
      `LMS completion ${c.lms.toFixed(0)}%`,
    );
  if (c.engagement !== null && c.engagement >= 40)
    positives.push(
      `${s.engagement.filter((e) => e.verified).length} verified engagement activities`,
    );
  if (c.skills !== null)
    (c.skills >= 75 ? positives : c.skills < 55 ? negatives : []).push(
      `Avg skills ${c.skills.toFixed(0)}/100`,
    );
  if (c.placement !== null)
    (c.placement >= 75 ? positives : c.placement < 50 ? negatives : []).push(
      `Placement readiness ${c.placement.toFixed(0)}%`,
    );
  if (s.backlogs > 0) negatives.push(`${s.backlogs} active backlog${s.backlogs > 1 ? "s" : ""}`);
  return {
    score: Math.round(score * 10) / 10,
    completeness,
    components: c,
    band: riskBand(score),
    positives,
    negatives,
    missing,
  };
}
export function checkEligibility(s, d) {
  const criteria = [
    {
      label: `CGPA ≥ ${d.minCgpa}`,
      result: s.cgpa > 0 ? (s.cgpa >= d.minCgpa ? "Pass" : "Fail") : "Unknown",
      detail: s.cgpa > 0 ? `Student CGPA ${s.cgpa.toFixed(2)}` : "CGPA on record missing",
    },
    {
      label: `Backlogs ≤ ${d.maxBacklogs}`,
      result: s.backlogs <= d.maxBacklogs ? "Pass" : "Fail",
      detail: `${s.backlogs} active backlogs`,
    },
  ];
  // A drive open to every branch or graduating year simply leaves those fields empty.
  if (d.branches?.length)
    criteria.push({
      label: `Branch: ${d.branches.join("/")}`,
      result: d.branches.includes(s.branch) ? "Pass" : "Fail",
      detail: `Student branch ${s.branch}`,
    });
  if (d.gradYear)
    criteria.push({
      label: `Graduation year ${d.gradYear}`,
      result: s.gradYear === d.gradYear ? "Pass" : "Fail",
      detail: `Student graduates ${s.gradYear}`,
    });
  if (d.requiresAssessment) {
    criteria.push({
      label: "Assessment completed",
      result:
        s.assessmentsRequired > 0
          ? s.assessmentsCompleted >= s.assessmentsRequired
            ? "Pass"
            : "Fail"
          : "Unknown",
      detail:
        s.assessmentsRequired > 0
          ? `${s.assessmentsCompleted}/${s.assessmentsRequired} assessments done`
          : "Assessment record missing",
    });
  }
  const failed = criteria.filter((c) => c.result === "Fail");
  const unknown = criteria.filter((c) => c.result === "Unknown");
  const eligible = failed.length === 0 && unknown.length === 0;
  const explanation = eligible
    ? "All criteria passed — eligible."
    : failed.length > 0
      ? `Not eligible: failed ${failed.map((c) => c.label).join(", ")}.`
      : `Eligibility unknown: missing data for ${unknown.map((c) => c.label).join(", ")}. Cannot be marked eligible until resolved.`;
  return { drive: d, criteria, eligible, explanation };
}
export function crossSourceInsights(students) {
  const out = [];
  for (const s of students) {
    const att = studentAttendancePct(s);
    const lms = lmsCompletion(s);
    const c = componentScores(s);
    const grades = s.semesterGrades;
    const firstG = grades[0] ?? 0;
    const lastG = grades[grades.length - 1] ?? 0;
    const declining = grades.length >= 2 && lastG < firstG - 0.5;
    let riskCount = 0;
    if (s.cgpa >= 8 && att !== null && att < 75) {
      riskCount++;
      out.push({
        studentId: s.id,
        studentName: s.name,
        type: "Good CGPA, poor attendance",
        detail: `CGPA ${s.cgpa.toFixed(2)} but attendance ${att.toFixed(1)}% — below the 75% threshold.`,
        severity: "warning",
      });
    }
    if (att !== null && att >= 90 && declining) {
      riskCount++;
      out.push({
        studentId: s.id,
        studentName: s.name,
        type: "High attendance, declining academics",
        detail: `Attendance ${att.toFixed(0)}% but SGPA fell from ${firstG.toFixed(1)} to ${lastG.toFixed(1)}.`,
        severity: "warning",
      });
    }
    if (s.cgpa >= 7.5 && lms !== null && lms < 60) {
      riskCount++;
      out.push({
        studentId: s.id,
        studentName: s.name,
        type: "Good marks, incomplete LMS",
        detail: `CGPA ${s.cgpa.toFixed(2)} but only ${lms.toFixed(0)}% LMS completion with ${pendingAssignments(s).length} pending assignments.`,
        severity: "info",
      });
    }
    if (s.skills.coding >= 80 && s.skills.aptitude < 55) {
      riskCount++;
      out.push({
        studentId: s.id,
        studentName: s.name,
        type: "Strong coding, weak aptitude",
        detail: `Coding ${s.skills.coding}/100 vs aptitude ${s.skills.aptitude}/100 — aptitude practice recommended.`,
        severity: "info",
      });
    }
    if (s.cgpa >= 8 && c.placement !== null && c.placement < 55) {
      riskCount++;
      out.push({
        studentId: s.id,
        studentName: s.name,
        type: "High CGPA, low placement readiness",
        detail: `CGPA ${s.cgpa.toFixed(2)} but placement readiness ${c.placement.toFixed(0)}% (resume ${s.resumeCompleteness}%, assessments ${s.assessmentsCompleted}/${s.assessmentsRequired}).`,
        severity: "critical",
      });
    }
    if (riskCount >= 2) {
      out.push({
        studentId: s.id,
        studentName: s.name,
        type: "Multiple simultaneous risk indicators",
        detail: `${riskCount} cross-source risk signals active at once — prioritized for mentor review.`,
        severity: "critical",
      });
    }
  }
  return out;
}
export function recommendations(s) {
  const recs = [];
  const att = studentAttendancePct(s);
  const lms = lmsCompletion(s);
  if (att !== null && att < 75)
    recs.push(
      `Attend the next ${classesNeededForTarget(
        s.subjects.reduce((a, x) => a + x.classesAttended, 0),
        s.subjects.reduce((a, x) => a + x.classesHeld, 0),
        75,
      )} classes consecutively to reach the 75% attendance requirement.`,
    );
  if (lms !== null && lms < 70)
    recs.push(
      `Complete ${pendingAssignments(s).length} pending LMS assignment(s) before their deadlines.`,
    );
  if (s.skills.aptitude < 60)
    recs.push("Schedule weekly aptitude practice sessions (target: 60+ score).");
  if (s.resumeCompleteness < 80)
    recs.push(
      `Resume is ${s.resumeCompleteness}% complete — add missing sections with the placement cell.`,
    );
  if (s.assessmentsCompleted < s.assessmentsRequired)
    recs.push(
      `Finish ${s.assessmentsRequired - s.assessmentsCompleted} remaining placement assessment(s).`,
    );
  if (s.backlogs > 0)
    recs.push(`Clear ${s.backlogs} backlog subject(s) in the next supplementary exam window.`);
  if (recs.length === 0)
    recs.push("On track — maintain current performance and explore advanced certifications.");
  return recs;
}
