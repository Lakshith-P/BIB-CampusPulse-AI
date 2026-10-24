import { ownStudent, requireAdminUser, requireStaff, visibleStudent } from "./access.server.js";
import { loadInputs } from "./predictions.server.js";
import { decisionMetrics, intervalOf, sideConfidence } from "@/lib/classify";
import { contributions, crossValidate, effectPerUnit, fitRidge, predict } from "@/lib/linreg";
import { leetcodePoints, resultPrediction } from "@/lib/prediction";

// Linear-regression models trained on this platform's own records. Three models, each with an
// outcome that is actually recorded in the database:
//   result_marks    final subject marks      from mid exams, continuous work, attendance, rating
//   next_sgpa       next semester's SGPA     from the SGPA history
//   interview_score mock-interview score     from LeetCode, aptitude, CGPA, resume
// Each is cross-validated on students it never saw. Because a regression predicts a number, its
// accuracy, precision, recall and F1 are measured on the decisions made from that number (for
// example "marks below 40 means fail"), and each prediction carries a confidence and an interval.

const MIN_ROWS = 30;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
const round = (n, p = 2) => Number(n.toFixed(p));

function slope(values) {
  const n = values.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2;
  const my = mean(values);
  const sxx = values.reduce((a, _, i) => a + (i - mx) ** 2, 0);
  return values.reduce((a, v, i) => a + (i - mx) * (v - my), 0) / sxx;
}

export const MODELS = {
  result_marks: {
    label: "Result model",
    outcome: "Final subject marks",
    unit: "marks out of 100",
    features: ["Mid exams %", "Continuous assessment %", "Attendance %", "Teacher rating (of 100)"],
    range: [0, 100],
    rules: [
      { name: "Fail", label: "final marks below 40 (the pass mark)", test: (v) => v < 40 },
      { name: "Needs attention", label: "final marks below 55", test: (v) => v < 55 },
    ],
    headline: { rule: 0, threshold: 40 },
  },
  next_sgpa: {
    label: "Next-semester model",
    outcome: "Next semester's SGPA",
    unit: "SGPA out of 10",
    features: [
      "Last SGPA",
      "Average of earlier SGPAs",
      "SGPA trend per semester",
      "Semesters completed",
    ],
    range: [0, 10],
    rules: [
      { name: "Weak semester", label: "SGPA below 6.0", test: (v) => v < 6 },
      {
        name: "Improves",
        label: "SGPA higher than the last one",
        test: (v, meta) => v > meta.last,
      },
    ],
    headline: { rule: 0, threshold: 6 },
  },
  interview_score: {
    label: "Interview model",
    outcome: "Mock-interview score",
    unit: "score out of 100",
    features: ["LeetCode points", "Aptitude", "CGPA x 10", "Resume %"],
    range: [0, 100],
    rules: [
      { name: "Not interview-ready", label: "interview score below 60", test: (v) => v < 60 },
      { name: "Strong", label: "interview score of 75 or more", test: (v) => v >= 75 },
    ],
    headline: { rule: 0, threshold: 60 },
  },
};

// ------------------------------------------------------------------ feature builders

/** Feature rows for the result model: one per subject that has mid, continuous and attendance data. */
export function resultRows(id, input) {
  return resultPrediction(input).subjects.flatMap((s) => {
    const v = (key) => s.components.find((c) => c.key === key)?.value;
    if (v("mid") === null || v("continuous") === null || v("attendance") === null) return [];
    return [
      {
        group: id,
        x: [v("mid"), v("continuous"), v("attendance"), v("rating")],
        y: s.recordedMarks,
        meta: { subject: s.subject, ruleBased: s.predicted },
      },
    ];
  });
}

/** Feature vector for predicting the next SGPA from a history, or null with no history. */
export function sgpaFeatures(grades) {
  if (!grades.length) return null;
  return [
    grades.at(-1),
    mean(grades.slice(0, -1).length ? grades.slice(0, -1) : grades),
    slope(grades),
    grades.length,
  ];
}

export function sgpaRows(id, grades) {
  const clean = grades.filter((g) => typeof g === "number" && Number.isFinite(g) && g >= 0);
  return clean.slice(1).map((y, i) => ({
    group: id,
    x: sgpaFeatures(clean.slice(0, i + 1)),
    y,
    meta: { last: clean[i] },
  }));
}

export function interviewFeatures(input) {
  const { student, coding } = input;
  const aptitude = student.skills?.aptitude;
  if (!coding || !(aptitude >= 0) || !(student.cgpa > 0) || !(student.resumeCompleteness >= 0))
    return null;
  return [leetcodePoints(coding), aptitude, student.cgpa * 10, student.resumeCompleteness];
}

export function interviewRows(id, input) {
  const x = interviewFeatures(input);
  const scores = (input.mocks ?? []).map((m) => m.score).filter((n) => typeof n === "number");
  return x && scores.length ? [{ group: id, x, y: mean(scores), meta: {} }] : [];
}

// ------------------------------------------------------------------ training

async function trainingInputs(db) {
  const { rows } = await db.query(
    `SELECT id, jsonb_build_object(
        'name', record->'name', 'subjects', record->'subjects', 'skills', record->'skills',
        'cgpa', record->'cgpa', 'resumeCompleteness', record->'resumeCompleteness',
        'mockInterviews', record->'mockInterviews', 'semesterGrades', record->'semesterGrades') AS record
       FROM student_records ORDER BY id`,
  );
  return { rows, inputs: await loadInputs(db, rows) };
}

function datasets({ rows, inputs }) {
  const result = [];
  const sgpa = [];
  const interview = [];
  for (const row of rows) {
    const input = inputs.get(row.id);
    result.push(...resultRows(row.id, input).filter((r) => typeof r.y === "number"));
    sgpa.push(...sgpaRows(row.id, row.record.semesterGrades ?? []));
    interview.push(...interviewRows(row.id, input));
  }
  return { result_marks: result, next_sgpa: sgpa, interview_score: interview };
}

/** Fits one model, cross-validates it and scores its decisions. Pure, so it is easy to test. */
export function trainOne(key, rowsIn, { lambda = 3 } = {}) {
  const spec = MODELS[key];
  if (rowsIn.length < MIN_ROWS)
    return {
      key,
      trained: false,
      rows: rowsIn.length,
      reason: `Needs at least ${MIN_ROWS} records; found ${rowsIn.length}.`,
    };
  // a missing teacher rating is filled with the average so those subjects still train the model
  // (60 = a neutral 3 out of 5 when no teacher has rated anyone yet)
  const fill =
    key === "result_marks"
      ? (mean(rowsIn.map((r) => r.x[3]).filter((v) => v !== null)) ?? 60)
      : null;
  const rows = rowsIn.map((r) => ({ ...r, x: r.x.map((v, j) => (v === null ? fill : v)) }));
  const X = rows.map((r) => r.x);
  const y = rows.map((r) => r.y);
  const groups = rows.map((r) => r.group);

  const baselines = {
    "Always predict the average": (train) => mean(train.map((i) => y[i])),
    ...(key === "next_sgpa" ? { "Repeat the last SGPA": (_, i) => rows[i].meta.last } : {}),
    ...(key === "result_marks" ? { "Fixed-weight formula": (_, i) => rows[i].meta.ruleBased } : {}),
  };
  const cv = crossValidate(X, y, groups, { k: 5, lambda, baselines });
  const model = { ...fitRidge(X, y, { names: spec.features, lambda }), fill };

  const kept = y.map((_, i) => i).filter((i) => cv.predicted[i] !== null);
  const decisions = spec.rules.map((rule) => ({
    name: rule.name,
    label: rule.label,
    ...decisionMetrics(
      kept.map((i) => rule.test(y[i], rows[i].meta)),
      kept.map((i) => rule.test(cv.predicted[i], rows[i].meta)),
    ),
  }));
  const rivals = Object.fromEntries(
    Object.entries(cv.baselines).map(([name, m]) => [
      name,
      { mae: round(m.mae), rmse: round(m.rmse), r2: round(m.r2, 3), n: m.n },
    ]),
  );
  // the same decisions made by each baseline, so the F1 of the model has something to be compared with
  const rivalDecisions = Object.fromEntries(
    Object.entries(cv.rival).map(([name, values]) => {
      const idx = kept.filter((i) => values[i] !== null && values[i] !== undefined);
      return [
        name,
        spec.rules.map(
          (rule) =>
            decisionMetrics(
              idx.map((i) => rule.test(y[i], rows[i].meta)),
              idx.map((i) => rule.test(values[i], rows[i].meta)),
            ).f1,
        ),
      ];
    }),
  );
  return {
    key,
    trained: true,
    rows: rows.length,
    students: new Set(groups).size,
    model,
    metrics: {
      mae: round(cv.model.mae),
      rmse: round(cv.model.rmse),
      r2: round(cv.model.r2, 3),
      n: cv.model.n,
      folds: cv.folds,
      baselines: rivals,
      baselineF1: rivalDecisions,
      decisions,
      effects: effectPerUnit(model).map((e, j) => ({
        feature: spec.features[j],
        perUnit: round(e, 4),
      })),
    },
  };
}

/** Admin: retrains every model from the live data and stores the result. */
export async function trainModels(db, user) {
  requireAdminUser(user);
  const data = datasets(await trainingInputs(db));
  const out = [];
  for (const key of Object.keys(MODELS)) {
    const trained = trainOne(key, data[key]);
    if (trained.trained)
      await db.query(
        "INSERT INTO ml_models (name, rows, model, metrics, trained_by) VALUES ($1,$2,$3,$4,$5)",
        [
          key,
          trained.rows,
          JSON.stringify(trained.model),
          JSON.stringify({ ...trained.metrics, students: trained.students }),
          user.id,
        ],
      );
    out.push({ key, trained: trained.trained, rows: trained.rows, reason: trained.reason ?? null });
  }
  cache.at = 0;
  return out;
}

// ------------------------------------------------------------------ reading models

const cache = { at: 0, models: null };

async function latestModels(db) {
  if (cache.models && Date.now() - cache.at < 60_000) return cache.models;
  const { rows } = await db.query(
    "SELECT DISTINCT ON (name) name, rows, model, metrics, trained_at FROM ml_models ORDER BY name, trained_at DESC",
  );
  cache.models = Object.fromEntries(rows.map((r) => [r.name, r]));
  cache.at = Date.now();
  return cache.models;
}

/** What each model is, how well it did on unseen students, and what it learned. */
export async function getModelReport(db, user) {
  requireStaff(user);
  const models = await latestModels(db);
  return Object.entries(MODELS).map(([key, spec]) => {
    const stored = models[key];
    return {
      key,
      label: spec.label,
      outcome: spec.outcome,
      unit: spec.unit,
      trained: Boolean(stored),
      trainedAt: stored?.trained_at ?? null,
      rows: stored?.rows ?? 0,
      metrics: stored?.metrics ?? null,
    };
  });
}

const reliabilityOf = (stored, spec) => ({
  trainedAt: stored.trained_at,
  rows: stored.rows,
  mae: stored.metrics.mae,
  rmse: stored.metrics.rmse,
  r2: stored.metrics.r2,
  decisions: stored.metrics.decisions.map((d) => ({
    name: d.name,
    label: d.label,
    accuracy: d.accuracy,
    precision: d.precision,
    recall: d.recall,
    f1: d.f1,
    support: d.support,
    n: d.n,
  })),
  headline: spec.rules[spec.headline.rule].name,
});

function explain(spec, stored, x, value, meta = {}) {
  const [lo, hi] = spec.range;
  const rmse = stored.metrics.rmse;
  const rule = spec.rules[spec.headline.rule];
  const positive = rule.test(value, meta);
  const sure = sideConfidence(value, spec.headline.threshold, rmse);
  return {
    value: round(clamp(value, lo, hi), spec.unit.startsWith("SGPA") ? 2 : 1),
    interval: (({ low, high }) => ({ low: clamp(low, lo, hi), high: clamp(high, lo, hi) }))(
      intervalOf(value, rmse),
    ),
    headline: { name: rule.name, flagged: positive, confidence: sure },
    drivers: contributions(stored.model, x).map((c) => ({
      feature: c.name,
      value: round(c.value, 1),
      average: round(c.average, 1),
      effect: round(c.contribution, 2),
    })),
  };
}

/** What changing one input would do to the prediction; a linear model's effect per unit times the change. */
function whatIfs(stored, x, changes) {
  const effects = effectPerUnit(stored.model);
  return changes
    .map((c) => {
      const delta = Math.min(c.delta, c.max - x[c.index]);
      return { label: c.label, change: round(delta, 1), gain: round(effects[c.index] * delta, 2) };
    })
    .filter((c) => c.change > 0 && c.gain > 0.05)
    .sort((a, b) => b.gain - a.gain);
}

/**
 * Predictions for one student from the trained models: each with an interval, a confidence, the
 * drivers behind it and a ranked list of what would improve it. Also returns each model's
 * measured accuracy, precision, recall and F1 so the numbers can be judged.
 */
export async function learnedPredictions(db, user, { studentId } = {}) {
  const row = studentId ? await visibleStudent(db, user, studentId) : await ownStudent(db, user);
  if (!row) throw new Error("That student record is not available to you.");
  const models = await latestModels(db);
  const input = (await loadInputs(db, [row])).get(row.id);
  const out = {
    studentId: row.id,
    trained: Object.keys(models).length > 0,
    result: null,
    nextSgpa: null,
    interview: null,
  };

  const stored = models.result_marks;
  if (stored) {
    const spec = MODELS.result_marks;
    const subjects = resultPrediction(input).subjects.flatMap((s) => {
      const v = (key) => s.components.find((c) => c.key === key)?.value;
      if (v("mid") === null || v("continuous") === null || v("attendance") === null) return [];
      const x = [v("mid"), v("continuous"), v("attendance"), v("rating") ?? stored.model.fill];
      const value = predict(stored.model, x);
      return [
        {
          subject: s.subject,
          ...explain(spec, stored, x, value),
          ruleBased: s.predicted,
          improve: whatIfs(stored, x, [
            {
              index: 2,
              label:
                s.attendance < 80
                  ? `Raise attendance from ${s.attendance}% to 80%`
                  : "Keep attendance at its current level",
              delta: s.attendance < 80 ? 80 - x[2] : 0,
              max: 100,
            },
            {
              index: 1,
              label: "Score 10 points higher in continuous assessments",
              delta: 10,
              max: 100,
            },
            { index: 0, label: "Score 10 points higher in the next mid exam", delta: 10, max: 100 },
            { index: 3, label: "Improve the teacher's rating by one star", delta: 20, max: 100 },
          ]),
        },
      ];
    });
    out.result = {
      subjects: subjects.sort((a, b) => a.value - b.value),
      reliability: reliabilityOf(stored, spec),
    };
  }

  const sgpaModel = models.next_sgpa;
  const grades = (row.record.semesterGrades ?? []).filter((g) => typeof g === "number" && g >= 0);
  if (sgpaModel && grades.length) {
    const spec = MODELS.next_sgpa;
    const x = sgpaFeatures(grades);
    out.nextSgpa = {
      ...explain(spec, sgpaModel, x, predict(sgpaModel.model, x), { last: grades.at(-1) }),
      last: grades.at(-1),
      improves: predict(sgpaModel.model, x) > grades.at(-1),
      reliability: reliabilityOf(sgpaModel, spec),
    };
  }

  const interviewModel = models.interview_score;
  const features = interviewFeatures(input);
  if (interviewModel && features) {
    const spec = MODELS.interview_score;
    out.interview = {
      ...explain(spec, interviewModel, features, predict(interviewModel.model, features)),
      improve: whatIfs(interviewModel, features, [
        {
          index: 0,
          label: "Solve 100 more LeetCode points (about 33 medium problems)",
          delta: 100,
          max: 2000,
        },
        { index: 1, label: "Raise aptitude by 10 points", delta: 10, max: 100 },
        { index: 3, label: "Raise the resume by 15 points", delta: 15, max: 100 },
        { index: 2, label: "Raise CGPA by 0.5", delta: 5, max: 100 },
      ]),
      reliability: reliabilityOf(interviewModel, spec),
    };
  }
  return out;
}
