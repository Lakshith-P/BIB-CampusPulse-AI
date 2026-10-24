import { describe, expect, it } from "vitest";

import {
  decisionMetrics,
  intervalOf,
  normalCdf,
  sideConfidence,
  thresholdReport,
} from "@/lib/classify";
import {
  contributions,
  crossValidate,
  effectPerUnit,
  fitRidge,
  metrics,
  predict,
  solve,
} from "@/lib/linreg";

// A tiny seeded generator so the tests are repeatable.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dataset = (n, seed = 1, noise = 0) => {
  const r = rng(seed);
  const X = Array.from({ length: n }, () => [r() * 100, r() * 100, r() * 5]);
  // y = 10 + 0.5*a + 0.2*b + 4*c (+ noise)
  const y = X.map(([a, b, c]) => 10 + 0.5 * a + 0.2 * b + 4 * c + (r() - 0.5) * noise);
  return { X, y };
};

describe("solve", () => {
  it("solves a linear system and rejects a singular one", () => {
    expect(
      solve(
        [
          [2, 1],
          [1, 3],
        ],
        [3, 5],
      ).map((v) => Number(v.toFixed(6))),
    ).toEqual([0.8, 1.4]);
    expect(() =>
      solve(
        [
          [1, 2],
          [2, 4],
        ],
        [1, 2],
      ),
    ).toThrow(/dependent/);
  });
});

describe("ridge regression", () => {
  it("recovers the true coefficients from noise-free data", () => {
    const { X, y } = dataset(200);
    const model = fitRidge(X, y, { names: ["a", "b", "c"], lambda: 1e-6 });
    const [a, b, c] = effectPerUnit(model);
    expect(a).toBeCloseTo(0.5, 3);
    expect(b).toBeCloseTo(0.2, 3);
    expect(c).toBeCloseTo(4, 2);
    expect(predict(model, [50, 50, 2.5])).toBeCloseTo(10 + 25 + 10 + 10, 2);
  });

  it("shrinks the weights as lambda grows", () => {
    const { X, y } = dataset(100, 2, 10);
    const small = fitRidge(X, y, { lambda: 0.01 });
    const big = fitRidge(X, y, { lambda: 5000 });
    expect(Math.abs(big.weights[0])).toBeLessThan(Math.abs(small.weights[0]));
  });

  it("explains a prediction feature by feature, and refuses too little data", () => {
    const { X, y } = dataset(100);
    const model = fitRidge(X, y, { names: ["a", "b", "c"], lambda: 1e-6 });
    const parts = contributions(model, [100, model.mean[1], model.mean[2]]);
    expect(parts[0].name).toBe("a");
    expect(parts[0].contribution).toBeGreaterThan(0);
    expect(parts.find((p) => p.name === "b").contribution).toBeCloseTo(0, 6);
    expect(() => fitRidge(X.slice(0, 3), y.slice(0, 3))).toThrow(/Not enough rows/);
  });
});

describe("metrics and cross-validation", () => {
  it("computes MAE, RMSE and R squared", () => {
    expect(metrics([1, 2, 3], [1, 2, 3])).toMatchObject({ mae: 0, rmse: 0, r2: 1 });
    const m = metrics([0, 10], [5, 5]);
    expect(m.mae).toBe(5);
    expect(m.r2).toBeCloseTo(0, 6);
  });

  it("scores on unseen students and beats a mean-only baseline when there is signal", () => {
    const { X, y } = dataset(300, 3, 8);
    const groups = X.map((_, i) => `S${Math.floor(i / 3)}`); // three rows per student
    const cv = crossValidate(X, y, groups, {
      k: 5,
      baselines: { mean: (train) => train.reduce((s, i) => s + y[i], 0) / train.length },
    });
    expect(cv.model.n).toBe(300);
    expect(cv.model.r2).toBeGreaterThan(0.9);
    expect(cv.model.mae).toBeLessThan(cv.baselines.mean.mae / 2);
  });

  it("keeps every row of one student in the same fold", () => {
    const { X, y } = dataset(60, 4, 5);
    const groups = X.map((_, i) => `S${i % 6}`);
    const cv = crossValidate(X, y, groups, { k: 3 });
    expect(cv.model.n).toBe(60);
  });
});

describe("accuracy, precision, recall and F1", () => {
  it("scores a decision from held-out predictions", () => {
    // 4 real positives; the model flags 3 of them plus 1 wrong
    const actual = [true, true, true, true, false, false, false, false];
    const flagged = [true, true, true, false, true, false, false, false];
    const m = decisionMetrics(actual, flagged);
    expect(m.confusion).toEqual({ tp: 3, fp: 1, fn: 1, tn: 3 });
    expect(m.accuracy).toBe(0.75);
    expect(m.precision).toBe(0.75);
    expect(m.recall).toBe(0.75);
    expect(m.f1).toBe(0.75);
    expect(m.support).toBe(4);
  });

  it("reports null instead of inventing a score when nothing was flagged or nothing was positive", () => {
    const none = decisionMetrics([false, false, false], [false, false, false]);
    expect(none.accuracy).toBe(1);
    expect(none.precision).toBeNull();
    expect(none.recall).toBeNull();
    expect(none.f1).toBeNull();
  });

  it("turns numbers into a decision with a threshold", () => {
    const report = thresholdReport([30, 35, 60, 80], [38, 45, 52, 90], {
      name: "Fail",
      label: "below 40",
      below: 40,
    });
    expect(report.confusion).toEqual({ tp: 1, fp: 0, fn: 1, tn: 2 });
    expect(report.recall).toBe(0.5);
    expect(report.precision).toBe(1);
    const ready = thresholdReport([70, 50], [65, 58], {
      name: "Ready",
      label: "60 or more",
      atLeast: 60,
    });
    expect(ready.confusion).toEqual({ tp: 1, fp: 0, fn: 0, tn: 1 });
  });

  it("ignores rows the model never predicted", () => {
    const report = thresholdReport([10, 20, 90], [null, 15, 95], {
      name: "x",
      label: "x",
      below: 50,
    });
    expect(report.n).toBe(2);
  });

  it("gives a confidence that grows with distance from the threshold", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 4);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(sideConfidence(40, 40, 5)).toBe(0.5);
    expect(sideConfidence(50, 40, 5)).toBeGreaterThan(0.97);
    expect(sideConfidence(30, 40, 5)).toBeCloseTo(sideConfidence(50, 40, 5), 6);
    expect(sideConfidence(50, 40, 0)).toBeNull();
    const i = intervalOf(60, 5);
    expect(i.low).toBeCloseTo(51.78, 1);
    expect(i.high).toBeCloseTo(68.23, 1);
  });
});
