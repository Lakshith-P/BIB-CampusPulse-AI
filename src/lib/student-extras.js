import {
  attendancePct,
  attendanceMarks,
  classesNeededForTarget,
  maxMissableClasses,
  successScore,
} from "./scoring";
import { riskBand } from "./types";

/** Classes still to be held in the semester, per subject, used to see which targets are reachable. */
export const REMAINING_CLASSES_PER_SUBJECT = 14;

/** What a student must do in one subject to reach a better attendance mark. */
export function attendancePlan(subject, held, attended) {
  const pct = attendancePct(attended, held);
  const marks = attendanceMarks(pct);
  const needFor90 = held > 0 ? classesNeededForTarget(attended, held, 90) : 0;
  const needFor85 = held > 0 ? classesNeededForTarget(attended, held, 85) : 0;
  const canMissAt90 = held > 0 ? maxMissableClasses(attended, held, 90) : 0;
  const reachable90 = needFor90 <= REMAINING_CLASSES_PER_SUBJECT;
  const reachable85 = needFor85 <= REMAINING_CLASSES_PER_SUBJECT;
  const target = reachable90 ? 90 : reachable85 ? 85 : 75;
  let status = "safe";
  let message;
  if (pct === null) {
    status = "watch";
    message = "No classes recorded yet.";
  } else if (pct >= 90)
    message = `Great — you earn 5 marks. You can miss up to ${canMissAt90} more class(es) and stay at 90%.`;
  else if (reachable90) {
    status = "watch";
    message = `Attend the next ${needFor90} class(es) without a break to reach 90% (5 marks).`;
  } else if (reachable85) {
    status = "warning";
    message = `90% is no longer reachable this semester. New target 85% (4 marks): attend the next ${needFor85} class(es).`;
  } else {
    status = "critical";
    message = `Warning: even 85% is out of reach. Attend every remaining class to stay above 75% and speak to your mentor.`;
  }
  if (pct !== null && pct < 75) status = "critical";
  return {
    subject,
    held,
    attended,
    pct,
    marks,
    needFor90,
    needFor85,
    canMissAt90,
    target,
    reachable90,
    reachable85,
    status,
    message,
  };
}

/** Engagement entries with no approved evidence. They are shown to the student but never scored. */
export function integrityFlags(s) {
  const flags = [];
  for (const e of s.engagement)
    if (!e.verified)
      flags.push({
        kind: e.name.toLowerCase().startsWith("claimed") ? "Possible fraud" : "Unverified",
        detail: `${e.name} — no evidence approved yet; it does not count toward your score.`,
      });
  return flags;
}
export function engagementScore(s) {
  const pts = s.engagement.reduce(
    (a, e) =>
      a +
      (e.verified
        ? e.type === "hackathon"
          ? 30
          : e.type === "certification"
            ? 25
            : e.type === "club"
              ? 20
              : 15
        : 0),
    0,
  );
  return Math.min(100, pts);
}

// Rule-based segments — first match wins, mirroring the dataset's official scoring.py.
export function segmentOf(s) {
  const c = successScore(s).components;
  const academics = c.academics ?? -1;
  const placement = c.placement ?? -1;
  const att = c.attendance ?? -1;
  const lms = c.lms ?? -1;
  const eng = c.engagement ?? -1;
  const drop =
    s.semesterGrades.length >= 2 ? (s.semesterGrades[0] ?? 0) - (s.semesterGrades.at(-1) ?? 0) : 0;
  const score = successScore(s).score ?? -1;
  if (academics >= 75 && placement >= 0 && placement < 60)
    return {
      name: "High academics, low placement readiness",
      action: "Resume clinic + mock interviews + aptitude practice.",
    };
  if (academics >= 70 && att >= 0 && att < 75)
    return {
      name: "Strong grades, poor attendance",
      action: "Attendance contract and class-wise reminders.",
    };
  if (att >= 85 && drop >= 1.0)
    return {
      name: "Good attendance, declining academics",
      action: "Doubt sessions and a revision plan for the weakest units.",
    };
  if (s.skills.coding >= 75 && s.skills.aptitude >= 0 && s.skills.aptitude < 50)
    return { name: "Strong coder, aptitude gap", action: "Daily aptitude practice sets." };
  if (score >= 0 && score < 65 && lms >= 0 && lms < 60 && eng >= 0 && eng < 25)
    return {
      name: "Disengaged, multiple risks",
      action: "Weekly mentoring plus one club or event this month.",
    };
  if (riskBand(score) === "On Track")
    return { name: "On track", action: "Stretch goals: hackathons, research, leadership." };
  return {
    name: "Steady, no standout pattern",
    action: "Maintain current performance and complete pending LMS work.",
  };
}
