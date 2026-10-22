// Rules of the Boss Battle quiz game, kept free of React so they can be tested directly.

export const BASE_POINTS = 100;
export const TIME_BONUS_MAX = 50;
export const BOSS_MULTIPLIER = 2;
/** Questions per stage; the last question of each stage (and of the quiz) is a boss round. */
export const STAGE_SIZE = 5;
/** Seconds the Time Warp lifeline adds to the open round. */
export const TIME_WARP_SEC = 10;
/** Correct answers in a row that earn a shield (absorbs one miss and keeps the combo). */
export const SHIELD_STREAK = 4;
export const MAX_SHIELDS = 2;
/** Share of the quiz that must be right to defeat the boss, and the misses the wizard survives. */
export const KILL_SHARE = 0.7;
export const FAIL_SHARE = 0.4;

export const START_LIFELINES = { fifty: 1, warp: 1 };

/** Round length follows attention span: short-attention learners get brisker rounds. */
export const roundSecondsFor = (attention) =>
  attention === "low" ? 15 : attention === "high" ? 25 : 20;

export const stageOf = (index) => Math.floor(index / STAGE_SIZE);
export const stageCount = (total) => Math.ceil(total / STAGE_SIZE);
export const isBossRound = (index, total) => (index + 1) % STAGE_SIZE === 0 || index === total - 1;

/** Stars for a stage from its accuracy: 3 at 80%, 2 at 60%, 1 at 30%. */
export function starsFor(correct, count) {
  const r = count === 0 ? 0 : correct / count;
  return r >= 0.8 ? 3 : r >= 0.6 ? 2 : r >= 0.3 ? 1 : 0;
}

export const comboMultiplier = (combo) => (combo >= 5 ? 2 : combo >= 3 ? 1.5 : 1);

export function pointsFor(timeLeftSec, roundSec, combo, boss = false) {
  const bonus = Math.round(TIME_BONUS_MAX * Math.min(1, Math.max(0, timeLeftSec) / roundSec));
  return Math.round((BASE_POINTS + bonus) * comboMultiplier(combo) * (boss ? BOSS_MULTIPLIER : 1));
}

export const freshRun = () => ({
  results: [],
  combo: 0,
  bestCombo: 0,
  shields: 0,
  lifelines: { ...START_LIFELINES },
});

/**
 * Applies one answer. `choice` is null when time ran out. A miss with a shield in hand is
 * absorbed: it scores nothing but keeps the combo. Four right in a row earns a shield.
 */
export function applyAnswer(run, { index, total, choice, correctIndex, timeLeft, roundSec }) {
  const correct = choice !== null && choice === correctIndex;
  const boss = isBossRound(index, total);
  const shielded = !correct && run.shields > 0;
  const combo = correct ? run.combo + 1 : shielded ? run.combo : 0;
  let shields = run.shields;
  if (shielded) shields -= 1;
  else if (correct && combo % SHIELD_STREAK === 0) shields = Math.min(MAX_SHIELDS, shields + 1);
  const points = correct ? pointsFor(timeLeft, roundSec, combo, boss) : 0;
  return {
    ...run,
    combo,
    bestCombo: Math.max(run.bestCombo, combo),
    shields,
    results: [...run.results, { answer: choice, correct, points, boss, shielded }],
  };
}

/** Clearing a stage with three stars refuels one lifeline, alternating between the two. */
export function refuel(run, finishedIndex) {
  const to = finishedIndex + 1;
  if (to % STAGE_SIZE !== 0) return run;
  const stage = run.results.slice(to - STAGE_SIZE, to);
  if (starsFor(stage.filter((r) => r.correct).length, stage.length) !== 3) return run;
  const l = run.lifelines;
  return {
    ...run,
    lifelines:
      stageOf(finishedIndex) % 2 === 0 ? { ...l, fifty: l.fifty + 1 } : { ...l, warp: l.warp + 1 },
  };
}

/** Two wrong options for 50/50 (never the right one). */
export function pickEliminated(options, correctIndex, rand = Math.random) {
  const wrong = options.map((_, i) => i).filter((i) => i !== correctIndex);
  for (let i = wrong.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [wrong[i], wrong[j]] = [wrong[j], wrong[i]];
  }
  return wrong.slice(0, 2);
}

/** Boss and wizard health after the answers so far. */
export function healthAfter(results, total) {
  const killAt = Math.max(1, Math.ceil(total * KILL_SHARE));
  const failAt = Math.max(1, Math.ceil(total * FAIL_SHARE));
  const correct = results.filter((r) => r.correct).length;
  const hits = results.filter((r) => !r.correct && !r.shielded).length;
  return {
    boss: Math.max(0, 1 - correct / killAt),
    hero: Math.max(0, 1 - hits / failAt),
  };
}

export function rankFor(results, total) {
  const correct = results.filter((r) => r.correct).length;
  const share = total ? correct / total : 0;
  return share >= 0.9
    ? "Boss obliterated"
    : share >= KILL_SHARE
      ? "Boss defeated"
      : "Boss still standing";
}

// ── Sound: tiny synthesized cues, no assets and no network ──────────────────
let audioCtx = null;

function beep(ctx, freq, at, dur, gain = 0.08, type = "sine") {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(gain, at + 0.015);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(amp).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

export function playTone(kind) {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    const t = audioCtx.currentTime;
    if (kind === "correct") {
      beep(audioCtx, 660, t, 0.12);
      beep(audioCtx, 990, t + 0.09, 0.18);
    } else if (kind === "wrong") beep(audioCtx, 196, t, 0.22, 0.07, "triangle");
    else if (kind === "lifeline") {
      beep(audioCtx, 880, t, 0.08, 0.06, "square");
      beep(audioCtx, 1320, t + 0.07, 0.14, 0.05, "square");
    } else if (kind === "shield") {
      beep(audioCtx, 392, t, 0.1, 0.07, "triangle");
      beep(audioCtx, 587, t + 0.08, 0.2, 0.07, "triangle");
    } else if (kind === "boss") {
      beep(audioCtx, 110, t, 0.35, 0.09, "sawtooth");
      beep(audioCtx, 165, t + 0.18, 0.4, 0.07, "sawtooth");
    } else if (kind === "stage")
      [440, 554, 659].forEach((f, i) => beep(audioCtx, f, t + i * 0.09, 0.22, 0.06));
    else if (kind === "summit")
      [523, 659, 784, 1047].forEach((f, i) => beep(audioCtx, f, t + i * 0.11, 0.3, 0.07));
  } catch {
    // Audio is decoration; it must never break the game.
  }
}
