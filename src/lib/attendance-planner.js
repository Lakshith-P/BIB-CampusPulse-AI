import { attendanceMarks, classesNeededForTarget, maxMissableClasses } from "./scoring";

// Attendance mathematics for one subject (or all subjects together). Everything comes from the
// real class counts; "remaining" is the number of classes still to be held this semester.

export const TARGETS = [75, 80, 85, 90];
/** Marks policy below the 75% line. Configurable: 0 marks and a warning by default. */
export const BELOW_THRESHOLD_MARKS = 0;
/** Within this many points above 75% the student is "approaching" the threshold. */
export const APPROACHING_MARGIN = 3;

export const marksFor = (pct) => {
  if (pct === null) return null;
  return pct < 75 ? BELOW_THRESHOLD_MARKS : attendanceMarks(pct);
};

const pctOf = (attended, held) => (held > 0 ? (attended / held) * 100 : null);

/**
 * Where a subject stands against a chosen target.
 * need: classes to attend in a row to reach the target (0 when already there).
 * canMiss: further classes that can be missed while staying at or above the target.
 */
export function plan({ subject, held, attended }, target, remaining) {
  const pct = pctOf(attended, held);
  const need = held > 0 ? classesNeededForTarget(attended, held, target) : 0;
  const canMiss = held > 0 ? maxMissableClasses(attended, held, target) : 0;
  const bestCase = pctOf(attended + remaining, held + remaining);
  const worstCase = pctOf(attended, held + remaining);
  return {
    subject,
    held,
    attended,
    missed: held - attended,
    pct,
    marks: marksFor(pct),
    target,
    need,
    canMiss: Math.min(canMiss, remaining),
    reachable: need <= remaining,
    bestCase,
    worstCase,
  };
}

/** What happens if the next `missNext` classes are skipped and all others attended. */
export function projectMissing(held, attended, remaining, missNext) {
  const miss = Math.min(Math.max(0, missNext), remaining);
  return pctOf(attended + (remaining - miss), held + remaining);
}

/**
 * A warning with its reason and the suggested action, or null when nothing needs attention.
 * red: below 75%; amber: approaching 75% or the chosen target is slipping out of reach.
 */
export function warningFor(p, remaining) {
  if (p.pct === null) return null;
  if (p.pct < 75) {
    const need75 = classesNeededForTarget(p.attended, p.held, 75);
    return {
      level: "breach",
      reason: `${p.subject} is at ${p.pct.toFixed(1)}%, below the 75% requirement.`,
      action:
        need75 <= remaining
          ? `Attend the next ${need75} class(es) without a break to reach 75%.`
          : "75% can no longer be reached this semester. Speak to your mentor about the shortage policy.",
    };
  }
  if (p.pct < 75 + APPROACHING_MARGIN) {
    const canMiss75 = Math.min(maxMissableClasses(p.attended, p.held, 75), remaining);
    return {
      level: "approaching",
      reason: `${p.subject} is at ${p.pct.toFixed(1)}%, close to the 75% line.`,
      action:
        canMiss75 > 0
          ? `You can miss at most ${canMiss75} more class(es) and stay at 75%.`
          : "You cannot afford to miss any more classes.",
    };
  }
  if (!p.reachable)
    return {
      level: "approaching",
      reason: `${p.target}% is out of reach in ${p.subject} this semester (needs ${p.need} classes, ${remaining} remain).`,
      action: `Choose a lower target. Attending every remaining class gives ${p.bestCase.toFixed(1)}%.`,
    };
  return null;
}

/** Totals across subjects, shaped like one subject. */
export function combine(subjects) {
  return subjects.reduce(
    (a, s) => ({
      subject: "Overall",
      held: a.held + s.classesHeld,
      attended: a.attended + s.classesAttended,
    }),
    { subject: "Overall", held: 0, attended: 0 },
  );
}
