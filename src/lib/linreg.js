// Ridge (L2-regularised) linear regression, solved exactly with the normal equations, plus the
// pieces needed to trust and explain it: cross-validation grouped by student, error metrics and a
// per-feature breakdown of each prediction. No dependencies, so it runs the same in the app, in
// scripts and in tests.

const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);

/** Solves A x = b by Gaussian elimination with partial pivoting. A is n x n. */
export function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    if (Math.abs(M[pivot][col]) < 1e-12) throw new Error("The features are linearly dependent.");
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let c = i + 1; c < n; c++) s -= M[i][c] * x[c];
    x[i] = s / M[i][i];
  }
  return x;
}

/**
 * Fits y = intercept + sum(w_j * z_j) where z are the standardised features. `lambda` shrinks the
 * weights, which keeps the fit stable when features move together (attendance and marks do).
 */
export function fitRidge(X, y, { names, lambda = 1 } = {}) {
  const n = X.length;
  const p = X[0]?.length ?? 0;
  if (n < p + 2) throw new Error(`Not enough rows (${n}) to fit ${p} features.`);
  const mu = Array.from({ length: p }, (_, j) => mean(X.map((r) => r[j])));
  const sd = Array.from({ length: p }, (_, j) => {
    const s = Math.sqrt(mean(X.map((r) => (r[j] - mu[j]) ** 2)));
    return s < 1e-9 ? 1 : s;
  });
  const Z = X.map((r) => r.map((v, j) => (v - mu[j]) / sd[j]));
  const yBar = mean(y);
  const A = Array.from({ length: p }, (_, a) =>
    Array.from(
      { length: p },
      (_, b) => Z.reduce((s, row) => s + row[a] * row[b], 0) + (a === b ? lambda : 0),
    ),
  );
  const rhs = Array.from({ length: p }, (_, a) =>
    Z.reduce((s, row, i) => s + row[a] * (y[i] - yBar), 0),
  );
  const w = solve(A, rhs);
  return {
    names: names ?? Array.from({ length: p }, (_, j) => `x${j}`),
    mean: mu,
    std: sd,
    weights: w, // per standard deviation of each feature
    intercept: yBar,
    lambda,
    n,
  };
}

export function predict(model, x) {
  return (
    model.intercept +
    x.reduce((s, v, j) => s + model.weights[j] * ((v - model.mean[j]) / model.std[j]), 0)
  );
}

/** The model's change in prediction per one unit of each feature (e.g. per attendance point). */
export const effectPerUnit = (model) => model.weights.map((w, j) => w / model.std[j]);

/** How far each feature moved this prediction away from the average student's. */
export function contributions(model, x) {
  return model.names
    .map((name, j) => ({
      name,
      value: x[j],
      average: model.mean[j],
      contribution: model.weights[j] * ((x[j] - model.mean[j]) / model.std[j]),
    }))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
}

export function metrics(actual, predicted) {
  const n = actual.length;
  const err = actual.map((a, i) => predicted[i] - a);
  const mae = mean(err.map(Math.abs));
  const rmse = Math.sqrt(mean(err.map((e) => e * e)));
  const yBar = mean(actual);
  const ssTot = actual.reduce((s, a) => s + (a - yBar) ** 2, 0);
  const ssRes = err.reduce((s, e) => s + e * e, 0);
  return { n, mae, rmse, r2: ssTot > 0 ? 1 - ssRes / ssTot : 0 };
}

const hashGroup = (g) =>
  [...String(g)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 17);

/**
 * K-fold cross-validation in which every row of one group (a student) stays in the same fold, so
 * the model is always scored on students it has never seen. `baseline(trainRows, testRow)` gives
 * a simple competitor's prediction for each held-out row.
 */
export function crossValidate(X, y, groups, { k = 5, lambda = 1, baselines = {} } = {}) {
  const fold = groups.map((g) => hashGroup(g) % k);
  const predicted = new Array(y.length).fill(null);
  const rival = Object.fromEntries(
    Object.keys(baselines).map((name) => [name, new Array(y.length).fill(null)]),
  );
  for (let f = 0; f < k; f++) {
    const train = [];
    const test = [];
    fold.forEach((v, i) => (v === f ? test : train).push(i));
    if (!test.length || train.length < (X[0]?.length ?? 0) + 2) continue;
    const model = fitRidge(
      train.map((i) => X[i]),
      train.map((i) => y[i]),
      { lambda },
    );
    for (const i of test) {
      predicted[i] = predict(model, X[i]);
      for (const [name, fn] of Object.entries(baselines)) rival[name][i] = fn(train, i);
    }
  }
  const scored = y.map((_, i) => i).filter((i) => predicted[i] !== null);
  const actual = scored.map((i) => y[i]);
  const result = {
    model: metrics(
      actual,
      scored.map((i) => predicted[i]),
    ),
    baselines: {},
    folds: k,
    // each row's prediction from a model that never saw that student (null if it was skipped)
    predicted,
    rival,
  };
  for (const [name, values] of Object.entries(rival)) {
    const idx = scored.filter((i) => values[i] !== null);
    result.baselines[name] = metrics(
      idx.map((i) => y[i]),
      idx.map((i) => values[i]),
    );
  }
  return result;
}
