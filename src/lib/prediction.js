import { semesterResult } from "@/lib/grades";
import { classesNeededForTarget } from "@/lib/scoring";

// The placement and result predictions. Both are transparent weighted models: every weight is
// published below, every input comes from the student's own records, and each prediction lists
// the drivers behind it. Components that have no data are left out and the remaining weights are
// scaled up, with the confidence lowered, so missing data is never treated as zero.

export const PLACEMENT_WEIGHTS = { leetcode: 25, aptitude: 20, cgpa: 20, mock: 20, resume: 15 };
export const RESULT_WEIGHTS = { mid: 35, continuous: 25, attendance: 25, rating: 15 };

const LABELS = {
  leetcode: "LeetCode",
  aptitude: "Aptitude",
  cgpa: "CGPA",
  mock: "Mock interviews",
  resume: "Resume",
  mid: "Mid exams",
  continuous: "Continuous assessments",
  attendance: "Attendance",
  rating: "Teacher rating",
};
export const labelOf = (key) => LABELS[key] ?? key;

const BENCHMARK = 60; // a component at this level neither helps nor hurts the score
const TARGET = 75; // the level improvement actions aim for
const clamp = (n, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));
const round = (n, places = 1) => Number(n.toFixed(places));
const known = (v) => typeof v === "number" && Number.isFinite(v);
const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
const day = 24 * 3600 * 1000;

/** Change per week through dated points, or null with fewer than two points. */
export function slopePerWeek(points) {
  const pts = points
    .filter((p) => known(p.value) && p.date)
    .map((p) => ({ t: new Date(p.date).getTime() / (7 * day), v: p.value }))
    .filter((p) => Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t);
  if (pts.length < 2) return null;
  const mt = mean(pts.map((p) => p.t));
  const mv = mean(pts.map((p) => p.v));
  const sxx = pts.reduce((a, p) => a + (p.t - mt) ** 2, 0);
  if (sxx < 1e-9) return null;
  return pts.reduce((a, p) => a + (p.t - mt) * (p.v - mv), 0) / sxx;
}

/** Combines weighted components, re-scaling over those that have data. */
function combine(components, weights, project = false, horizon = 0) {
  const have = components.filter((c) => known(c.value));
  const total = have.reduce((a, c) => a + weights[c.key], 0);
  if (!total) return { score: null, projected: null, coverage: 0, have: [], total: 0 };
  const value = (c) =>
    project && known(c.slope) ? clamp(c.value + 0.5 * c.slope * horizon) : c.value;
  return {
    score: have.reduce((a, c) => a + weights[c.key] * c.value, 0) / total,
    projected: have.reduce((a, c) => a + weights[c.key] * value(c), 0) / total,
    coverage: total / Object.values(weights).reduce((a, b) => a + b, 0),
    have,
    total,
  };
}

const confidenceOf = (coverage) => (coverage >= 0.85 ? "High" : coverage >= 0.6 ? "Medium" : "Low");

export const placementBand = (score) =>
  score >= 75
    ? "Placement-ready"
    : score >= 60
      ? "On track"
      : score >= 45
        ? "Needs work"
        : "At risk";

export function leetcodePoints(profile) {
  return (profile.easy ?? 0) + 3 * (profile.medium ?? 0) + 6 * (profile.hard ?? 0);
}

export function placementPrediction(input) {
  const { student, coding, mocks = [], aptitudeHistory = [], horizonWeeks = 12 } = input;
  const recentMocks = [...mocks]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 3);

  const components = Object.keys(PLACEMENT_WEIGHTS).map((key) => ({
    key,
    label: LABELS[key],
    weight: PLACEMENT_WEIGHTS[key],
    value: null,
    detail: "No data recorded",
    slope: null,
  }));
  const at = (key) => components.find((c) => c.key === key);

  if (coding) {
    const points = leetcodePoints(coding);
    Object.assign(at("leetcode"), {
      value: clamp(points / 4),
      detail: `${coding.easy}E / ${coding.medium}M / ${coding.hard}H solved (${points} points)${
        known(coding.contest_rating) ? `, contest rating ${coding.contest_rating}` : ""
      }`,
    });
  }
  if (known(student.skills?.aptitude) && student.skills.aptitude >= 0)
    Object.assign(at("aptitude"), {
      value: student.skills.aptitude,
      detail: `Aptitude score ${student.skills.aptitude}/100`,
      slope: slopePerWeek(aptitudeHistory.map((a) => ({ date: a.date, value: a.score }))),
    });
  if (known(student.cgpa) && student.cgpa > 0)
    Object.assign(at("cgpa"), { value: clamp(student.cgpa * 10), detail: `CGPA ${student.cgpa}` });
  if (recentMocks.length) {
    const avg = mean(recentMocks.map((m) => m.score));
    const coverage = 0.5 + 0.5 * Math.min(1, mocks.length / 3);
    Object.assign(at("mock"), {
      value: clamp(avg * coverage),
      detail: `${mocks.length} mock interview(s), recent average ${round(avg)}${mocks.length < 3 ? " (fewer than 3, so discounted)" : ""}`,
      slope: slopePerWeek(mocks.map((m) => ({ date: m.date, value: m.score }))),
    });
  } else if (student.mockInterviews === 0)
    Object.assign(at("mock"), { value: 0, detail: "No mock interview completed yet" });
  if (known(student.resumeCompleteness) && student.resumeCompleteness >= 0)
    Object.assign(at("resume"), {
      value: student.resumeCompleteness,
      detail: `Resume ${student.resumeCompleteness}% complete`,
    });

  const result = combine(components, PLACEMENT_WEIGHTS, true, horizonWeeks);
  if (result.score === null)
    return {
      score: null,
      projected: null,
      band: "Insufficient data",
      confidence: "Low",
      components,
      drivers: [],
      improve: [],
      horizonWeeks,
    };

  const drivers = result.have
    .map((c) => ({
      key: c.key,
      label: c.label,
      value: round(c.value),
      impact: round((c.weight / result.total) * (c.value - BENCHMARK)),
      detail: c.detail,
    }))
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  const improve = components
    .map((c) => ({
      key: c.key,
      label: c.label,
      value: known(c.value) ? round(c.value) : null,
      weight: c.weight,
      gain: round((c.weight / (result.total || 100)) * Math.max(0, TARGET - (c.value ?? 0))),
      detail: c.detail,
    }))
    .filter((c) => c.gain > 0)
    .sort((a, b) => b.gain - a.gain);

  return {
    score: round(result.score),
    projected: round(result.projected),
    band: placementBand(result.score),
    projectedBand: placementBand(result.projected),
    confidence: confidenceOf(result.coverage),
    horizonWeeks,
    components: components.map((c) => ({
      ...c,
      value: known(c.value) ? round(c.value) : null,
      slope: known(c.slope) ? round(c.slope, 2) : null,
    })),
    drivers,
    improve,
  };
}

const pctOf = (score, max) => (max > 0 ? (score / max) * 100 : null);

export const outlookOf = (predicted) =>
  predicted < 40 ? "At risk" : predicted < 55 ? "Watch" : "Safe";

export function resultPrediction(input) {
  const { student, exams = [], assignments = [], ratings = [] } = input;
  const names = [
    ...new Set([...(student.subjects ?? []).map((s) => s.subject), ...exams.map((e) => e.subject)]),
  ];
  const overallRating = mean(ratings.filter((r) => !r.subject).map((r) => r.rating));

  const subjects = names.map((name) => {
    const rec = (student.subjects ?? []).find((s) => s.subject === name);
    const mid = (kind) =>
      mean(
        exams
          .filter((e) => e.subject === name && e.kind === kind)
          .map((e) => pctOf(e.score, e.max)),
      );
    const [m1, m2] = [mid("mid1"), mid("mid2")];
    const midValue = known(m1) && known(m2) ? 0.4 * m1 + 0.6 * m2 : (m2 ?? m1);
    const caItems = [
      ...exams
        .filter((e) => e.subject === name && e.kind === "continuous")
        .map((e) => pctOf(e.score, e.max)),
      ...assignments
        .filter((a) => a.subject === name && known(a.marks))
        .map((a) => pctOf(a.marks, a.max)),
    ].filter(known);
    const att = rec?.classesHeld > 0 ? (rec.classesAttended / rec.classesHeld) * 100 : null;
    const own = mean(ratings.filter((r) => r.subject === name).map((r) => r.rating));
    const rating = known(own) ? own : overallRating;

    const values = {
      mid: known(midValue) ? clamp(midValue) : null,
      continuous: caItems.length ? clamp(mean(caItems)) : null,
      attendance: known(att) ? clamp(att) : null,
      rating: known(rating) ? clamp((rating / 5) * 100) : null,
    };
    const parts = Object.keys(RESULT_WEIGHTS).map((key) => ({
      key,
      label: LABELS[key],
      weight: RESULT_WEIGHTS[key],
      value: values[key],
    }));
    const enough = known(values.mid) || known(values.continuous);
    const combined = combine(parts, RESULT_WEIGHTS);
    const predicted = enough && combined.score !== null ? round(combined.score) : null;
    const detained = known(att) && att < 75;
    const outlook =
      predicted === null
        ? "Insufficient data"
        : detained && outlookOf(predicted) === "Safe"
          ? "Watch"
          : outlookOf(predicted);
    return {
      subject: name,
      predicted,
      outlook,
      confidence: confidenceOf(combined.coverage),
      recordedMarks: known(rec?.marks) ? rec.marks : null,
      attendance: known(att) ? round(att) : null,
      classesToReach75: detained
        ? classesNeededForTarget(rec.classesAttended, rec.classesHeld, 75)
        : 0,
      detentionRisk: detained,
      components: parts.map((p) => ({ ...p, value: known(p.value) ? round(p.value) : null })),
      drivers:
        predicted === null
          ? []
          : combined.have
              .map((p) => ({
                key: p.key,
                label: p.label,
                value: round(p.value),
                impact: round((p.weight / combined.total) * (p.value - BENCHMARK)),
              }))
              .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)),
    };
  });

  const scored = subjects.filter((s) => known(s.predicted));
  if (!scored.length)
    return {
      score: null,
      predictedSgpa: null,
      band: "Insufficient data",
      subjects,
      failedSubjects: [],
      detentionSubjects: [],
      averages: {},
    };
  const sgpa = semesterResult(scored.map((s) => ({ subject: s.subject, marks: s.predicted }))).sgpa;
  const averages = Object.fromEntries(
    Object.keys(RESULT_WEIGHTS).map((key) => {
      const values = scored.map((s) => s.components.find((c) => c.key === key).value).filter(known);
      return [key, values.length ? round(mean(values)) : null];
    }),
  );
  const band = scored.some((s) => s.outlook === "At risk")
    ? "At risk"
    : scored.some((s) => s.outlook === "Watch")
      ? "Watch"
      : "Safe";
  return {
    score: round(mean(scored.map((s) => s.predicted))),
    predictedSgpa: sgpa,
    band,
    subjects: [...subjects].sort((a, b) => (a.predicted ?? 101) - (b.predicted ?? 101)),
    failedSubjects: scored.filter((s) => s.predicted < 40).map((s) => s.subject),
    detentionSubjects: subjects.filter((s) => s.detentionRisk).map((s) => s.subject),
    averages,
  };
}

/** One risk level for the student, with the reasons behind it (used for alerts too). */
export function riskOf(placement, result) {
  if (placement.score === null && result.score === null)
    return {
      level: "Insufficient data",
      reasons: ["Not enough placement or assessment data has been recorded."],
    };
  const high = [];
  const medium = [];
  if (result.band === "At risk")
    high.push(
      `Predicted to fail ${result.failedSubjects.join(", ") || "a subject"} (predicted below 40).`,
    );
  if (result.detentionSubjects.length >= 2)
    high.push(
      `Attendance below 75% in ${result.detentionSubjects.length} subjects (${result.detentionSubjects.join(", ")}), which risks exam eligibility.`,
    );
  else if (result.detentionSubjects.length === 1)
    medium.push(`Attendance below 75% in ${result.detentionSubjects[0]}.`);
  const close = (result.subjects ?? []).filter((s) => s.predicted !== null && s.predicted < 55);
  if (close.length)
    medium.push(
      `${close.map((s) => `${s.subject} (${s.predicted})`).join(", ")} predicted close to the pass mark.`,
    );
  else if (result.band === "Watch" && !(result.subjects ?? []).length)
    medium.push("One or more subjects are predicted close to the pass mark.");
  if (placement.band === "At risk")
    high.push(`Placement prediction is ${placement.score}/100 (at risk).`);
  else if (placement.band === "Needs work")
    medium.push(`Placement prediction is ${placement.score}/100 (needs work).`);
  const level = high.length ? "High" : medium.length ? "Medium" : "Low";
  return {
    level,
    reasons: high.length
      ? [...high, ...medium]
      : medium.length
        ? medium
        : ["Both predictions are on track."],
  };
}

const OWNER = {
  leetcode: "Training & placement cell",
  aptitude: "Training & placement cell",
  mock: "Training & placement cell",
  resume: "Training & placement cell",
  cgpa: "Faculty mentor",
};

/** Specific, numbered actions for the weak spots, each tied to the prediction driver behind it. */
export function improvementActions(placement, result, student = {}) {
  const actions = [];
  for (const item of placement.improve ?? []) {
    if (item.gain < 1) continue;
    const base = {
      area: "placement",
      criterion: item.key,
      label: item.label,
      gain: item.gain,
      owner: OWNER[item.key],
    };
    const v = item.value;
    let title;
    let detail = `${item.label} is ${v === null ? "not recorded" : `${v}/100`}; raising it to ${TARGET} adds about ${item.gain} points to the placement score.`;
    if (item.key === "leetcode") {
      const points = student.__points ?? 0;
      const need = Math.max(0, TARGET * 4 - points);
      title =
        v === null
          ? "Start LeetCode: add your username or solved counts, then solve 2 problems a day"
          : `Solve about ${Math.ceil(need / 3)} more medium problems (or ${Math.ceil(need / 6)} hard) to reach a LeetCode score of ${TARGET}`;
    } else if (item.key === "aptitude")
      title = `Raise aptitude from ${v ?? "unassessed"} to ${TARGET}: three timed aptitude tests a week, reviewing every wrong answer`;
    else if (item.key === "mock")
      title = `Complete ${Math.max(1, 3 - (student.mockInterviews ?? 0))} more mock interview(s) and aim for an average of ${TARGET}`;
    else if (item.key === "resume")
      title = `Raise your resume from ${v ?? "not uploaded"}% to 80%: add measurable project outcomes and role keywords`;
    else
      title = `Lift CGPA${student.cgpa ? ` from ${student.cgpa}` : ""}: target a higher SGPA this semester through the subject plan below`;
    actions.push({
      ...base,
      title,
      detail,
      priority:
        placement.band === "At risk" && item.gain >= 5 ? "high" : item.gain >= 6 ? "medium" : "low",
    });
  }
  for (const s of result.subjects ?? []) {
    if (s.predicted === null || (s.outlook === "Safe" && !s.detentionRisk)) continue;
    const high = s.outlook === "At risk";
    const weakest = [...s.components]
      .filter((c) => known(c.value))
      .sort((a, b) => a.value - b.value)[0];
    if (s.detentionRisk)
      actions.push({
        area: "result",
        criterion: "attendance",
        label: s.subject,
        gain: 0,
        owner: "Faculty mentor",
        priority: "high",
        title: `Attend the next ${s.classesToReach75} class(es) of ${s.subject} to bring attendance from ${s.attendance}% to 75%`,
        detail: `Below 75% a student may be barred from the exam.`,
      });
    if (weakest && weakest.key !== "attendance")
      actions.push({
        area: "result",
        criterion: weakest.key,
        label: s.subject,
        gain: 0,
        owner: "Faculty mentor",
        priority: high ? "high" : "medium",
        title:
          weakest.key === "mid"
            ? `Revise the mid-exam topics of ${s.subject} with the subject teacher (mid score ${weakest.value}%)`
            : weakest.key === "continuous"
              ? `Complete pending assignments and quizzes in ${s.subject} (continuous assessment ${weakest.value}%)`
              : `Meet the ${s.subject} teacher for a feedback session (rating ${round(weakest.value / 20)}/5)`,
        detail: `${s.subject} is predicted at ${s.predicted} (${s.outlook}); ${weakest.label.toLowerCase()} is its weakest component.`,
      });
  }
  const order = { high: 0, medium: 1, low: 2 };
  return actions.sort((a, b) => order[a.priority] - order[b.priority] || b.gain - a.gain);
}

/** Both predictions, the risk level and the actions for one student. */
export function predictStudent(input) {
  const placement = placementPrediction(input);
  const result = resultPrediction(input);
  const risk = riskOf(placement, result);
  const points = input.coding ? leetcodePoints(input.coding) : 0;
  const actions = improvementActions(placement, result, { ...input.student, __points: points });
  return { placement, result, risk, actions };
}
