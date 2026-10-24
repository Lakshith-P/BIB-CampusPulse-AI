import { classesNeededForTarget, successScore } from "@/lib/scoring";
import { DEFAULT_WEIGHTS } from "@/lib/types";

// Comparing a student with classmates, their branch and the whole university, without ever naming
// anyone. A comparison is made over groups of at least MIN_GROUP students, and a list of the
// students who are ahead (never with names or IDs, and with figures rounded) only from groups of at
// least MIN_LIST. Everything here is plain, testable arithmetic over compact student records.

export const MIN_GROUP = 5;
export const MIN_LIST = 10;

export const METRICS = {
  score: "Success Score",
  academics: "Academics (CGPA x 10)",
  attendance: "Attendance",
  lms: "LMS completion",
  engagement: "Engagement",
  skills: "Skills (average)",
  placement: "Placement readiness",
  coding: "Coding skill",
  aptitude: "Aptitude skill",
};
export const GROUP_LABEL = {
  class: "your class (same branch and semester)",
  branch: "your branch",
  university: "the whole university",
};
const COMPONENTS = ["academics", "attendance", "lms", "engagement", "skills", "placement"];

const round1 = (n) => Math.round(n * 10) / 10;
const known = (v) => typeof v === "number" && Number.isFinite(v);

/** What a comparison needs from a full student record, with no name or ID. */
export function toPeer(id, s) {
  const r = successScore(s);
  const att = s.subjects.reduce((a, x) => a + x.classesAttended, 0);
  const held = s.subjects.reduce((a, x) => a + x.classesHeld, 0);
  return {
    id,
    branch: s.branch,
    semester: s.semester,
    course: s.course,
    score: r.score,
    components: r.components,
    skills: s.skills,
    cgpa: s.cgpa > 0 ? s.cgpa : null,
    attended: att,
    held,
    backlogs: s.backlogs,
    mockInterviews: s.mockInterviews ?? null,
    subjects: s.subjects.map((x) => ({ subject: x.subject, marks: x.marks })),
  };
}

export function metricValue(p, key) {
  if (key === "score") return known(p.score) ? p.score : null;
  if (key === "coding" || key === "aptitude") return p.skills[key] >= 0 ? p.skills[key] : null;
  return known(p.components[key]) ? p.components[key] : null;
}

const SAME = {
  class: (me, p) => p.branch === me.branch && p.semester === me.semester,
  branch: (me, p) => p.branch === me.branch,
  university: () => true,
};
export const membersOf = (me, peers, group) => peers.filter((p) => SAME[group](me, p));

const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
const median = (sorted) => {
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Where the student stands on one measure within one group: the rank, the share of the group they
 * are ahead of, the typical (median) student and the best 10% and 25% of the group.
 * Returns { tooSmall: true } when the group is too small to compare safely.
 */
export function standing(me, peers, group, key = "score") {
  const members = membersOf(me, peers, group);
  const mine = metricValue(me, key);
  const values = members.map((p) => metricValue(p, key)).filter(known);
  const base = { group, label: GROUP_LABEL[group], metric: key, size: members.length };
  if (members.length < MIN_GROUP) return { ...base, tooSmall: true };
  if (!known(mine) || values.length < MIN_GROUP) return { ...base, noData: true };
  const others = members
    .filter((p) => p.id !== me.id)
    .map((p) => metricValue(p, key))
    .filter(known);
  const sorted = [...values].sort((a, b) => b - a);
  const top = (share) => mean(sorted.slice(0, Math.max(1, Math.ceil(sorted.length * share))));
  const ahead = others.filter((v) => v > mine).length;
  const behind = others.filter((v) => v < mine).length;
  return {
    ...base,
    mine: round1(mine),
    rank: ahead + 1,
    of: others.length + 1,
    ahead,
    percentile: others.length ? Math.round((behind / others.length) * 100) : 100,
    median: round1(median([...sorted].reverse())),
    top25: round1(top(0.25)),
    top10: round1(top(0.1)),
    best: round1(sorted[0]),
  };
}

const nearest5 = (v) => (known(v) ? Math.min(100, Math.round(v / 5) * 5) : null);
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * The students just ahead of this one on a measure, closest first, as anonymous profiles: a letter
 * instead of a name, and every figure rounded to the nearest 5. Only from a group of MIN_LIST or
 * more, so a profile cannot be matched to a person.
 */
export function studentsAhead(me, peers, group, key = "score", limit = 8) {
  const members = membersOf(me, peers, group);
  if (members.length < MIN_LIST) return { tooSmall: true, size: members.length, list: [] };
  const mine = metricValue(me, key);
  if (!known(mine)) return { noData: true, size: members.length, list: [] };
  const list = members
    .filter((p) => p.id !== me.id && known(metricValue(p, key)) && metricValue(p, key) > mine)
    .sort((a, b) => metricValue(a, key) - metricValue(b, key))
    .slice(0, limit)
    .map((p, i) => ({
      label: `Student ${LETTERS[i]}`,
      score: nearest5(p.score),
      measure: nearest5(metricValue(p, key)),
      attendance: nearest5(p.components.attendance),
      lms: nearest5(p.components.lms),
      academics: nearest5(p.components.academics),
      skills: nearest5(p.components.skills),
      placement: nearest5(p.components.placement),
      engagement: nearest5(p.components.engagement),
    }));
  const total = members.filter(
    (p) => p.id !== me.id && known(metricValue(p, key)) && metricValue(p, key) > mine,
  ).length;
  return { size: members.length, total, list };
}

/** The smallest group that is big enough to compare with: class, then branch, then university. */
export function bestGroup(me, peers) {
  return (
    ["class", "branch", "university"].find((g) => membersOf(me, peers, g).length >= MIN_GROUP) ??
    null
  );
}

/** What to do about one weak area, in plain words, using the student's own numbers. */
function adviceFor(key, me, target, mine) {
  const t = Math.round(target);
  const m = Math.round(mine);
  switch (key) {
    case "attendance": {
      const need = classesNeededForTarget(me.attended, me.held, Math.min(99, t));
      return need > 0
        ? `Attend the next ${need} classes in a row to lift attendance from ${m}% to ${t}%.`
        : `Keep attendance at ${t}% or above; you are at ${m}% now.`;
    }
    case "lms":
      return `Finish pending lessons and assignments to take LMS completion from ${m}% to ${t}%.`;
    case "academics": {
      const weak = [...me.subjects]
        .sort((a, b) => a.marks - b.marks)
        .slice(0, 2)
        .map((s) => s.subject);
      return `Lift CGPA toward ${(t / 10).toFixed(1)} (now ${(m / 10).toFixed(1)})${weak.length ? `, starting with ${weak.join(" and ")}` : ""}.`;
    }
    case "skills": {
      const lowest = Object.entries(me.skills)
        .filter(([, v]) => v >= 0)
        .sort((a, b) => a[1] - b[1])[0];
      return `Raise your average skills from ${m} to ${t}${lowest ? `: start with ${lowest[0]} (${lowest[1]})` : ""}, with three timed practice tests a week.`;
    }
    case "engagement":
      return `Join one verified activity (event, club, hackathon or certification) and ask your teacher to verify it; engagement is ${m}, the top quarter is ${t}.`;
    default:
      return `Raise placement readiness from ${m} to ${t}: complete your resume, take a mock interview (the AI Interview page) and finish the assessments.`;
  }
}

/**
 * A ranked plan: for each score component, how far the student is from the top quarter of the
 * best comparable group, and how many Success Score points closing that gap would add (the gap
 * times the component's share of the weights). Strengths are left out.
 */
export function improvementPlan(me, peers, limit = 4) {
  const group = bestGroup(me, peers);
  if (!group) return { group: null, items: [] };
  const present = COMPONENTS.filter((c) => known(me.components[c]));
  const weightSum = present.reduce((a, c) => a + DEFAULT_WEIGHTS[c], 0);
  const items = present
    .map((c) => {
      const s = standing(me, peers, group, c);
      if (s.tooSmall || s.noData) return null;
      const gap = Math.max(0, s.top25 - s.mine);
      return {
        component: c,
        label: METRICS[c],
        mine: s.mine,
        median: s.median,
        top25: s.top25,
        gap: round1(gap),
        gain: round1((DEFAULT_WEIGHTS[c] / weightSum) * gap),
        advice: adviceFor(c, me, s.top25, s.mine),
      };
    })
    .filter((x) => x && x.gap >= 1)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, limit);
  return { group, label: GROUP_LABEL[group], items };
}

const detailOf = (me, group) =>
  group === "class"
    ? `${me.branch} · Semester ${me.semester}`
    : group === "branch"
      ? `${me.branch}, every semester`
      : "Every student";
export const RANK_GROUPS = ["class", "branch", "university"];
const RANKED = ["score", "academics", "attendance", "lms", "skills", "placement", "engagement"];

/** Puts the student's fresh figures into the cohort in place of the copy that may be a few minutes old. */
export const withMe = (peers, me) => peers.map((p) => (p.id === me.id ? me : p));

/**
 * The student's position: overall (Success Score) in their class, their branch and the whole
 * university, and the rank on each measure in each group. "topPercent" is the share of the group
 * at or above them (rank 3 of 100 is the top 3%). "nextGap" is how many Success Score points
 * separate them from the student one place above, shown only for groups of MIN_LIST or more.
 */
export function rankingOverview(me, peers) {
  const groups = RANK_GROUPS.map((key) => {
    const s = standing(me, peers, key, "score");
    const base = { key, label: GROUP_LABEL[key], detail: detailOf(me, key), size: s.size };
    if (s.tooSmall || s.noData)
      return {
        ...base,
        available: false,
        reason: s.tooSmall ? "too few students" : "no score yet",
      };
    let nextGap = null;
    if (s.size >= MIN_LIST && s.rank > 1) {
      const above = membersOf(me, peers, key)
        .filter((p) => p.id !== me.id && known(p.score) && p.score > me.score)
        .map((p) => p.score)
        .sort((a, b) => a - b)[0];
      nextGap = above === undefined ? null : round1(above - me.score);
    }
    return {
      ...base,
      available: true,
      rank: s.rank,
      of: s.of,
      ahead: s.ahead,
      percentile: s.percentile,
      topPercent: Math.max(1, Math.ceil((s.rank / s.of) * 100)),
      mine: s.mine,
      median: s.median,
      top10: s.top10,
      best: s.best,
      nextGap,
    };
  });
  const measures = RANKED.map((key) => {
    const out = { key, label: METRICS[key] };
    for (const g of RANK_GROUPS) {
      const s = standing(me, peers, g, key);
      out[g] =
        s.tooSmall || s.noData
          ? null
          : { rank: s.rank, of: s.of, percentile: s.percentile, mine: s.mine, median: s.median };
    }
    return out;
  }).filter((m) => RANK_GROUPS.some((g) => m[g]));
  return { groups, measures };
}
