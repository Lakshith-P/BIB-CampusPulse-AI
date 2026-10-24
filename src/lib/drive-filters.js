import { currentRound } from "@/lib/drive-rounds";

// Filters for the placement drive lists. A drive's `application` is the student's own status
// (applied, shortlisted = qualified for the next round, selected = passed, rejected = not selected).

const awaiting = (d) => d.open && !d.application;
const hasResult = (d, value) => Object.values(d.roundResults ?? {}).includes(value);
// still going through the rounds: applied or shortlisted, with a round to take
const inRounds = (d) =>
  (d.rounds?.length ?? 0) > 0 &&
  (d.application === "applied" || d.application === "shortlisted") &&
  Boolean(currentRound(d.rounds, d.roundResults ?? {}));

/** Filters on the student's list: [key, label, test]. */
export const STUDENT_DRIVE_FILTERS = [
  ["all", "All drives", () => true],
  ["open", "Open to apply", awaiting],
  ["eligible", "I am eligible", (d) => awaiting(d) && Boolean(d.eligibility?.eligible)],
  ["not-eligible", "Not eligible yet", (d) => awaiting(d) && !d.eligibility?.eligible],
  ["applied", "Applied, awaiting result", (d) => d.application === "applied"],
  ["qualified", "Qualified for next round", (d) => d.application === "shortlisted"],
  ["in-rounds", "In selection rounds", (d) => inRounds(d)],
  ["passed-round", "Passed a round", (d) => hasResult(d, "passed")],
  ["failed-round", "Failed a round", (d) => hasResult(d, "failed")],
  ["selected", "Passed / selected", (d) => d.application === "selected"],
  ["rejected", "Failed / not selected", (d) => d.application === "rejected"],
  ["past", "My past placement records", (d) => !d.open && Boolean(d.application)],
  ["closed", "Closed, deadline passed", (d) => !d.open],
];

/**
 * The student's filters, plus one for each round name that appears in the drives ("In round:
 * Technical interview"), so a student can find every drive where that round is next.
 */
export function studentDriveFilters(drives) {
  const names = new Map();
  for (const d of drives)
    for (const r of d.rounds ?? []) if (!names.has(r.toLowerCase())) names.set(r.toLowerCase(), r);
  const perRound = [...names].map(([key, name]) => [
    `round:${key}`,
    `In round: ${name}`,
    (d) => inRounds(d) && currentRound(d.rounds, d.roundResults ?? {}).toLowerCase() === key,
  ]);
  const at = STUDENT_DRIVE_FILTERS.findIndex(([k]) => k === "in-rounds") + 1;
  return [...STUDENT_DRIVE_FILTERS.slice(0, at), ...perRound, ...STUDENT_DRIVE_FILTERS.slice(at)];
}

/** Filters on the teacher's and administrator's list. */
export const STAFF_DRIVE_FILTERS = [
  ["all", "All drives", () => true],
  ["open", "Open", (d) => d.open],
  ["closed", "Closed, deadline passed", (d) => !d.open],
  ["applicants", "With applicants", (d) => (d.stats?.applicants ?? 0) > 0],
  ["shortlisted", "With shortlisted", (d) => (d.stats?.shortlisted ?? 0) > 0],
  ["selected", "With selected", (d) => (d.stats?.selected ?? 0) > 0],
];

/** The drives that pass one filter, and how many each filter would show. */
export function applyDriveFilter(drives, filters, key) {
  const test = (filters.find(([k]) => k === key) ?? filters[0])[2];
  return drives.filter(test);
}
export const driveFilterCounts = (drives, filters) =>
  Object.fromEntries(filters.map(([k, , test]) => [k, drives.filter(test).length]));
