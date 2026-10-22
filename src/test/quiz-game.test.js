import { describe, expect, it } from "vitest";

import {
  applyAnswer,
  freshRun,
  healthAfter,
  isBossRound,
  pickEliminated,
  pointsFor,
  refuel,
  starsFor,
} from "@/lib/quiz-game";

const answer = (run, index, right, total = 10) =>
  applyAnswer(run, {
    index,
    total,
    choice: right ? 1 : 0,
    correctIndex: 1,
    timeLeft: 10,
    roundSec: 20,
  });

describe("boss battle rules", () => {
  it("makes every 5th and the last question a boss round worth double", () => {
    expect([0, 3, 4, 9].map((i) => isBossRound(i, 10))).toEqual([false, false, true, true]);
    expect(isBossRound(6, 7)).toBe(true);
    expect(pointsFor(20, 20, 0, true)).toBe(pointsFor(20, 20, 0) * 2);
  });

  it("builds a combo, earns a shield after four, and lets the shield absorb one miss", () => {
    let run = freshRun();
    for (let i = 0; i < 4; i++) run = answer(run, i, true);
    expect(run.shields).toBe(1);
    expect(run.combo).toBe(4);
    run = answer(run, 4, false);
    expect(run.shields).toBe(0);
    expect(run.combo).toBe(4);
    expect(run.results.at(-1)).toMatchObject({ correct: false, shielded: true, points: 0 });
    run = answer(run, 5, false);
    expect(run.combo).toBe(0);
  });

  it("treats a timeout as a miss", () => {
    const run = applyAnswer(freshRun(), {
      index: 0,
      total: 5,
      choice: null,
      correctIndex: 1,
      timeLeft: 0,
      roundSec: 20,
    });
    expect(run.results[0].correct).toBe(false);
  });

  it("awards stars and refuels a lifeline after a three-star stage", () => {
    expect([5, 4, 3, 1, 0].map((c) => starsFor(c, 5))).toEqual([3, 3, 2, 0, 0]);
    let run = freshRun();
    for (let i = 0; i < 5; i++) run = answer(run, i, true);
    expect(refuel(run, 4).lifelines).toEqual({ fifty: 2, warp: 1 });
    expect(refuel(run, 3)).toBe(run);
  });

  it("eliminates two wrong options and never the right one", () => {
    for (let c = 0; c < 4; c++) {
      const out = pickEliminated(["a", "b", "c", "d"], c);
      expect(out).toHaveLength(2);
      expect(out).not.toContain(c);
    }
  });

  it("drains the boss on right answers and the wizard on unshielded misses", () => {
    let run = freshRun();
    run = answer(run, 0, true);
    run = answer(run, 1, false);
    const h = healthAfter(run.results, 10);
    expect(h.boss).toBeCloseTo(1 - 1 / 7);
    expect(h.hero).toBeCloseTo(1 - 1 / 4);
  });
});
