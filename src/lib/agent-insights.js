import { academicRisk, placementRisk } from "@/lib/risk-flags";
import { componentScores, studentAttendancePct } from "@/lib/scoring";
import { roleMatch } from "@/lib/role-match";

const available = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;

export const MIN_POINTS = 3;

/** Tops a list of next steps up to MIN_POINTS with extra data-specific ones, never repeating. */
const pad = (recommendations, extras) => {
  for (const extra of extras) {
    if (recommendations.length >= MIN_POINTS) break;
    if (extra && !recommendations.includes(extra)) recommendations.push(extra);
  }
  return recommendations;
};

const subjectAttendance = (subject) =>
  subject.classesHeld > 0 ? (subject.classesAttended / subject.classesHeld) * 100 : null;

export function academicAgentAssessment(student, updatedAt = null) {
  const risk = academicRisk(student);
  const grades = (student.semesterGrades ?? []).filter(available);
  const attendance = studentAttendancePct(student);
  const activities = student.engagement ?? [];
  const participation = {
    recorded: student.hasEngagementData === false ? null : activities.length,
    verified: activities.filter((activity) => activity.verified).length,
    unverified: activities.filter((activity) => !activity.verified).length,
  };
  const failedSubjects = (student.subjects ?? [])
    .filter((subject) => available(subject.marks) && subject.marks < 40)
    .map((subject) => subject.subject);
  const recommendations = [];

  if (student.backlogs > 0)
    recommendations.push(
      `Plan support for ${student.backlogs} active backlog${student.backlogs === 1 ? "" : "s"}.`,
    );
  if (attendance !== null && attendance < 75)
    recommendations.push("Agree a subject-by-subject attendance recovery plan with your mentor.");
  if (failedSubjects.length)
    recommendations.push(
      `Prioritize revision and faculty support for ${failedSubjects.join(", ")}.`,
    );
  if (grades.length >= 2 && grades.at(-1) < grades.at(-2))
    recommendations.push(
      "Review the latest semester result with your mentor and identify the subjects driving the change.",
    );
  if (participation.recorded === 0)
    recommendations.push(
      "Record recent class, club, or campus participation so engagement can be reviewed.",
    );
  if (!recommendations.length && risk.level !== "Insufficient data")
    recommendations.push(
      "Keep your attendance and coursework current, and review this assessment after your next results update.",
    );
  if (risk.level === "Insufficient data")
    recommendations.push(
      "Add verified marks and attendance so academic support can be based on current evidence.",
    );

  const marked = (student.subjects ?? [])
    .filter((subject) => available(subject.marks))
    .sort((a, b) => a.marks - b.marks);
  const lowAttendance = (student.subjects ?? [])
    .map((subject) => ({ subject: subject.subject, pct: subjectAttendance(subject) }))
    .filter((subject) => subject.pct !== null && subject.pct < 85)
    .sort((a, b) => a.pct - b.pct);
  pad(recommendations, [
    marked.length
      ? `Start revision with your lowest recorded marks: ${marked
          .slice(0, 2)
          .map((subject) => `${subject.subject} (${subject.marks})`)
          .join(", ")}; book a doubt-clearing session with the subject teacher this week.`
      : null,
    lowAttendance.length
      ? `Attendance is below 85% in ${lowAttendance
          .slice(0, 3)
          .map((subject) => `${subject.subject} (${subject.pct.toFixed(0)}%)`)
          .join(", ")}; attend every upcoming class in these subjects.`
      : null,
    available(student.cgpa) && student.cgpa > 0
      ? `Your CGPA is ${student.cgpa.toFixed(2)}; set a target for the next semester's SGPA and check progress with your mentor at mid-semester.`
      : null,
    "Ask your mentor for a short weekly check-in and write down one academic goal for each week.",
    "Review this assessment again after your next results or attendance update to confirm the plan is working.",
  ]);

  return {
    agent: "Academic Intelligence",
    method: "Rule-based review of the current student record; not a forecast.",
    risk: risk.level,
    drivers: risk.drivers,
    missing: risk.insufficient,
    attendance,
    cgpa: available(student.cgpa) && student.cgpa > 0 ? student.cgpa : null,
    backlogs: student.backlogs,
    latestSgpa: grades.at(-1) ?? null,
    semesterGrades: grades,
    participation,
    failedSubjects,
    recommendations,
    updatedAt,
  };
}

const STATUS_ORDER = { verified: 0, pending: 1, missing: 2 };
const names = (list, max = 3) =>
  list
    .slice(0, max)
    .map((item) => item.title ?? item.name ?? item.type ?? "activity")
    .join(", ");

/**
 * Step 1: what evidence exists and how far it can be trusted. "verified" means a teacher or the
 * system has confirmed it, "pending" means it exists but has not been confirmed yet, and
 * "missing" means nothing has been recorded.
 */
function placementVerification(student, skills, submissions) {
  const activities = student.engagement ?? [];
  const verifiedActivities = activities.filter((activity) => activity.verified);
  const pendingActivities = activities.filter((activity) => !activity.verified);
  const evidence = submissions.filter((item) => item.category === "placement");
  const evidenceVerified = evidence.filter((item) => item.verified).length;
  const evidencePending = evidence.length - evidenceVerified;
  const state = (verified, pending) => (pending ? "pending" : verified ? "verified" : "missing");
  const checks = [
    {
      id: "skills",
      item: "Skill assessments",
      status: skills.length ? "verified" : "missing",
      detail: skills.length
        ? `${skills.length} skill score(s) recorded by teachers`
        : "No skill has been assessed by a teacher yet",
    },
    {
      id: "resume",
      item: "Resume",
      status: student.resumeCompleteness >= 0 ? "verified" : "missing",
      detail:
        student.resumeCompleteness >= 0
          ? `Resume analysed at ${student.resumeCompleteness}% complete`
          : "No resume has been analysed yet",
    },
    {
      id: "mock",
      item: "Mock interviews",
      status: student.mockInterviews >= 0 ? "verified" : "missing",
      detail:
        student.mockInterviews >= 0
          ? `${student.mockInterviews} mock interview(s) completed on the platform`
          : "No mock interview has been recorded",
    },
    {
      id: "activities",
      item: "Projects, certifications and events",
      status: state(verifiedActivities.length, pendingActivities.length),
      detail: pendingActivities.length
        ? `${pendingActivities.length} awaiting teacher verification (${names(pendingActivities)})`
        : verifiedActivities.length
          ? `${verifiedActivities.length} verified by a teacher`
          : "None recorded",
    },
    {
      id: "evidence",
      item: "Evidence you submitted",
      status: state(evidenceVerified, evidencePending),
      detail: evidence.length
        ? `${evidenceVerified} verified, ${evidencePending} awaiting review`
        : "Nothing submitted",
    },
  ];
  const verifiedCount = checks.filter((check) => check.status === "verified").length;
  return {
    checks,
    verifiedCount,
    total: checks.length,
    stage: verifiedCount ? "suggestions-from-verified-evidence" : "verification-required",
    pendingActivities,
    verifiedActivities,
    evidence: { verified: evidenceVerified, pending: evidencePending },
  };
}

/** Step 2: suggestions built only from verified evidence; everything else becomes a request to verify it. */
function placementSuggestions(student, gaps, verification) {
  const status = Object.fromEntries(verification.checks.map((check) => [check.id, check.status]));
  const roles = (student.targetRoles ?? []).slice(0, 2);
  const suggestions = [];
  const verifyFirst = [];

  if (status.skills === "verified") {
    const matches = roles.map((role) => roleMatch(student.skills ?? {}, role)).filter(Boolean);
    for (const match of matches) {
      for (const gap of match.gaps.slice(0, 2))
        suggestions.push(
          `For ${match.role} (${match.match}% skill match), ${gap.skill} is ${gap.value}/100 against about ${gap.required} expected: do three timed ${gap.skill} practice sets a week and ask your teacher to re-assess it in 4 weeks.`,
        );
      if (match.unknown.length)
        verifyFirst.push(
          `Ask your teacher to assess ${match.unknown.join(", ")}, which ${match.role} needs and which has no recorded score.`,
        );
    }
    if (!matches.length && gaps.length)
      suggestions.push(
        `Your lowest verified skill is ${gaps[0].name} at ${gaps[0].value}/100 (below 60): schedule two practice sessions a week and get it re-assessed in 4 weeks.`,
      );
    if (!roles.length)
      suggestions.push(
        "Choose one or two target roles in your profile so your verified skills can be compared with what those roles need.",
      );
  } else
    verifyFirst.push(
      "Ask a teacher to record at least one skill assessment (coding, aptitude, analytical, verbal or communication).",
    );

  if (status.resume === "verified") {
    const resume = student.resumeCompleteness;
    const role = roles[0];
    suggestions.push(
      resume < 70
        ? `Your resume is ${resume}% complete (target 70%+): add measurable project outcomes and the skills ${role ? `a ${role} role asks for` : "your target roles ask for"}.`
        : `Your resume is ${resume}% complete: tailor its opening summary to ${role ?? "your chosen role"} and lead with your verified projects.`,
    );
  } else
    verifyFirst.push(
      "Upload your resume so it can be analysed; readiness cannot be judged without it.",
    );

  if (status.mock === "verified") {
    const done = student.mockInterviews;
    suggestions.push(
      done === 0
        ? "You have completed 0 mock interviews: book one this week and write down three points from its feedback."
        : done < 3
          ? `You have completed ${done} of the 3 mock interviews the readiness score expects: book the next one within 7 days.`
          : `You have completed ${done} mock interviews: pick the weakest feedback theme and repeat that interview type.`,
    );
  } else
    verifyFirst.push("Complete a mock interview so interview readiness has evidence behind it.");

  const verifiedActs = verification.verifiedActivities;
  if (verifiedActs.length)
    suggestions.push(
      `Put your ${verifiedActs.length} verified activit${verifiedActs.length === 1 ? "y" : "ies"} (${names(verifiedActs)}) on your resume with one measurable result each.`,
    );
  if (status.activities === "pending")
    verifyFirst.push(
      `Ask your teacher to verify ${names(verification.pendingActivities)}; unverified activities are not used to judge your readiness.`,
    );
  if (status.activities === "missing")
    verifyFirst.push(
      "Complete a project, certification or hackathon and record it in Engagement so a teacher can verify it.",
    );
  if (status.evidence === "pending")
    verifyFirst.push(
      `${verification.evidence.pending} placement evidence item(s) you submitted are awaiting teacher review: ask your mentor to review them.`,
    );
  if (status.evidence === "missing")
    verifyFirst.push(
      "Submit evidence (certificate, project link or offer letter) under Student-submitted evidence so a teacher can verify it.",
    );

  // Nothing verified yet: no tailored coaching, only the steps that unlock it.
  return verification.verifiedCount ? [...suggestions, ...verifyFirst] : verifyFirst;
}

export function placementAgentAssessment(student, updatedAt = null, { submissions = [] } = {}) {
  const risk = placementRisk(student);
  const readiness = componentScores(student).placement;
  const skills = Object.entries(student.skills ?? {})
    .filter(([, value]) => available(value))
    .map(([name, value]) => ({ name, value }));
  const gaps = skills.filter(({ value }) => value < 60).sort((a, b) => a.value - b.value);
  const missingSkills = Object.entries(student.skills ?? {})
    .filter(([, value]) => !available(value))
    .map(([name]) => name);
  const verifiedActivities = (student.engagement ?? []).filter(
    (activity) => activity.verified,
  ).length;
  const verification = placementVerification(student, skills, submissions);
  const recommendations = pad(placementSuggestions(student, gaps, verification), [
    "Return to this review after a teacher verifies new evidence; the suggestions are rebuilt from whatever is verified at that point.",
    "Ask your mentor which of the unverified items above they can review this week.",
    "Choose one target role and compare your verified skills with what it needs.",
  ]);

  return {
    agent: "Placement Readiness",
    method:
      "Rule-based review in two steps: evidence is verified first, then suggestions are built only from verified evidence. No placement probability is estimated.",
    risk: risk.level,
    drivers: risk.drivers,
    missing: [...risk.insufficient, ...missingSkills.map((name) => `${name} skill score`)],
    readiness,
    skills,
    skillGaps: gaps,
    resumeCompleteness: student.resumeCompleteness >= 0 ? student.resumeCompleteness : null,
    verifiedActivities,
    verification: {
      stage: verification.stage,
      verifiedCount: verification.verifiedCount,
      total: verification.total,
      checks: [...verification.checks].sort(
        (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
      ),
    },
    recommendations,
    updatedAt,
  };
}
