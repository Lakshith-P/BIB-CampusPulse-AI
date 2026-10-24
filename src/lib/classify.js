// Accuracy, precision, recall and F1 for a regression model, and a confidence for each of its
// predictions. A regression predicts a number; to say how often it is right the number is turned
// into a decision (for example "marks below 40 means fail") and that decision is compared with
// what really happened, using predictions made for students the model had never seen.

const round = (n, places = 3) => Number(n.toFixed(places));

/** Standard normal cumulative distribution (Abramowitz and Stegun 7.1.26 approximation). */
export function normalCdf(z) {
  const x = Math.abs(z) / Math.SQRT2; // the approximation is for erf(x), and Phi(z) uses x = z / sqrt(2)
  const t = 1 / (1 + 0.3275911 * x);
  const poly =
    t *
    (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-x * x);
  return 0.5 * (1 + (z >= 0 ? erf : -erf));
}

/**
 * Scores one decision. `positive` rows are those the decision is trying to catch (for example
 * "will fail"). Precision is how many flagged students really were positive; recall is how many
 * positive students were flagged; F1 is their harmonic mean.
 */
export function decisionMetrics(actualPositive, predictedPositive) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  actualPositive.forEach((a, i) => {
    const p = predictedPositive[i];
    if (a && p) tp++;
    else if (!a && p) fp++;
    else if (a && !p) fn++;
    else tn++;
  });
  const n = tp + fp + fn + tn;
  const precision = tp + fp ? tp / (tp + fp) : null;
  const recall = tp + fn ? tp / (tp + fn) : null;
  const f1 =
    precision !== null && recall !== null && precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : null;
  // The same score for the opposite class, so a macro average can be reported honestly.
  const precisionNeg = tn + fn ? tn / (tn + fn) : null;
  const recallNeg = tn + fp ? tn / (tn + fp) : null;
  const f1Neg =
    precisionNeg !== null && recallNeg !== null && precisionNeg + recallNeg > 0
      ? (2 * precisionNeg * recallNeg) / (precisionNeg + recallNeg)
      : null;
  const f1s = [f1, f1Neg].filter((v) => v !== null);
  return {
    n,
    support: tp + fn, // how many students really were positive
    accuracy: n ? round((tp + tn) / n) : null,
    precision: precision === null ? null : round(precision),
    recall: recall === null ? null : round(recall),
    f1: f1 === null ? null : round(f1),
    macroF1: f1s.length ? round(f1s.reduce((a, b) => a + b, 0) / f1s.length) : null,
    confusion: { tp, fp, fn, tn },
  };
}

/**
 * Turns held-out predictions into a decision and scores it. `rule` describes the decision, e.g.
 * { name: "Fail", label: "marks below 40", below: 40 }. A row counts as positive when the value
 * is below `below`, or at or above `atLeast`.
 */
export function thresholdReport(actual, predicted, rule) {
  const test = (v) => (rule.below !== undefined ? v < rule.below : v >= rule.atLeast);
  const keep = actual
    .map((_, i) => i)
    .filter((i) => predicted[i] !== null && predicted[i] !== undefined);
  return {
    name: rule.name,
    label: rule.label,
    ...decisionMetrics(
      keep.map((i) => test(actual[i])),
      keep.map((i) => test(predicted[i])),
    ),
  };
}

/** A 90% prediction interval from the model's cross-validated error. */
export const intervalOf = (value, rmse, z = 1.645) => ({
  low: round(value - z * rmse, 2),
  high: round(value + z * rmse, 2),
});

/**
 * How sure the model is that a student is on the predicted side of a threshold, assuming errors
 * like those seen in cross-validation (roughly normal with the held-out RMSE). 0.5 means the
 * prediction sits exactly on the line; 0.99 means it is far from it.
 */
export function sideConfidence(value, threshold, rmse) {
  if (!(rmse > 0)) return null;
  const p = normalCdf((value - threshold) / rmse);
  return round(Math.max(p, 1 - p), 3);
}
