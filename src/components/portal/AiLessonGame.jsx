import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock, Hourglass, Shield, Skull, Star, Swords, Volume2, VolumeX, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  TIME_WARP_SEC,
  applyAnswer,
  freshRun,
  healthAfter,
  isBossRound,
  pickEliminated,
  playTone,
  rankFor,
  refuel,
  roundSecondsFor,
  stageCount,
  stageOf,
  STAGE_SIZE,
  starsFor,
  comboMultiplier,
} from "@/lib/quiz-game";

const bestKey = (id) => `insight.game.best.${id}`;
const KEYS = ["1", "2", "3", "4"];

function HealthBar({ label, value, tone }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex justify-between text-xs">
        <span>{label}</span>
        <span className="tabular-nums">{Math.round(value * 100)}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(value * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2.5 overflow-hidden rounded-full bg-white/15"
      >
        <div
          className={cn("h-full rounded-full transition-all duration-500", tone)}
          style={{ width: `${value * 100}%` }}
        />
      </div>
    </div>
  );
}

/** The duel: a spell from the wizard on every right answer, a fireball from the boss on a miss. */
function Arena({ results, total, boss }) {
  const health = healthAfter(results, total);
  const last = results[results.length - 1];
  const [fx, setFx] = useState(null);
  useEffect(() => {
    if (!last) {
      setFx(null);
      return undefined;
    }
    setFx({ id: results.length, hero: last.correct, shielded: last.shielded });
    const t = setTimeout(() => setFx(null), 700);
    return () => clearTimeout(t);
  }, [results.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const bossHit = fx?.hero;
  const heroHit = fx && !fx.hero && !fx.shielded;
  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-b from-[#0b0716] via-[#1d1038] to-[#2a1450] p-4 text-white">
      <div className="mb-3 flex gap-4">
        <HealthBar label="Wizard" value={health.hero} tone="bg-emerald-400" />
        <HealthBar label="Void Warden" value={health.boss} tone="bg-rose-500" />
      </div>
      <svg viewBox="0 0 600 190" className="h-40 w-full" aria-hidden>
        <ellipse cx="300" cy="175" rx="280" ry="10" fill="#0d0820" />
        <g
          style={{
            transition: "transform 0.15s, filter 0.15s",
            transform: heroHit ? "translateX(-10px)" : "none",
            filter: heroHit ? "brightness(2.4) saturate(2)" : "none",
          }}
        >
          <path d="M90 170 L110 80 L130 170 Z" fill="#4f46e5" />
          <circle cx="110" cy="68" r="16" fill="#fde68a" />
          <path d="M92 62 L110 28 L128 62 Z" fill="#6366f1" />
          <rect x="136" y="70" width="4" height="100" rx="2" fill="#a16207" />
          <circle cx="138" cy="66" r="7" fill="#67e8f9" />
        </g>
        <g
          style={{
            transformBox: "fill-box",
            transformOrigin: "50% 50%",
            transition: "transform 0.15s, filter 0.15s",
            transform: bossHit ? "translateX(10px) scale(0.96)" : boss ? "scale(1.06)" : "none",
            filter: bossHit ? "brightness(3)" : "none",
            opacity: health.boss <= 0 ? 0.35 : 1,
          }}
        >
          <ellipse cx="480" cy="100" rx="64" ry="72" fill="#5b21b6" />
          <ellipse cx="480" cy="100" rx="48" ry="56" fill="#7c3aed" opacity="0.55" />
          <circle cx="460" cy="88" r="9" fill={boss ? "#fb7185" : "#fde68a"} />
          <circle cx="500" cy="88" r="9" fill={boss ? "#fb7185" : "#fde68a"} />
          <path d="M456 120 Q480 138 504 120" stroke="#1e0b3d" strokeWidth="5" fill="none" />
          <path d="M430 50 L420 20 L450 40 Z M530 50 L540 20 L510 40 Z" fill="#3b0764" />
        </g>
        {fx && (
          <circle
            key={fx.id}
            cy={fx.hero ? 66 : 100}
            r={fx.hero ? 9 : 12}
            fill={fx.hero ? "#67e8f9" : "#fb923c"}
          >
            <animate
              attributeName="cx"
              from={fx.hero ? 140 : 440}
              to={fx.hero ? 440 : 140}
              dur="0.45s"
              fill="freeze"
            />
          </circle>
        )}
      </svg>
      {boss && (
        <p className="text-center text-xs font-semibold text-rose-300">
          BOSS ROUND · double points
        </p>
      )}
    </div>
  );
}

function Stars({ count }) {
  return (
    <span className="inline-flex" aria-label={`${count} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <Star
          key={i}
          className={cn(
            "size-4",
            i < count ? "fill-amber-400 text-amber-400" : "text-muted-foreground",
          )}
        />
      ))}
    </span>
  );
}

/** The Boss Battle quiz game for one lesson. `onFinish(correct, total)` records the result. */
export function BossBattle({ lesson, onFinish }) {
  const quiz = lesson.content.quiz;
  const total = quiz.length;
  const roundSec = roundSecondsFor(lesson.traits.attentionSpan);

  const [phase, setPhase] = useState("intro"); // intro | question | revealed | summit
  const [index, setIndex] = useState(0);
  const [run, setRun] = useState(freshRun);
  const [eliminated, setEliminated] = useState([]);
  const [secs, setSecs] = useState(roundSec);
  const [muted, setMuted] = useState(false);
  const [best, setBest] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const [floater, setFloater] = useState(null);
  const startedAt = useRef(0);
  const bonus = useRef(0);
  const answering = useRef(false);

  const q = quiz[index];
  const boss = isBossRound(index, total);
  const score = run.results.reduce((s, r) => s + r.points, 0);
  const correctCount = run.results.filter((r) => r.correct).length;
  const last = run.results[run.results.length - 1];
  const sound = useCallback(
    (kind) => {
      if (!muted) playTone(kind);
    },
    [muted],
  );

  useEffect(() => {
    try {
      setBest(Number(localStorage.getItem(bestKey(lesson.id))) || 0);
    } catch {
      // Storage may be unavailable; the best score is a convenience.
    }
  }, [lesson.id]);

  const answer = useCallback(
    (choice) => {
      if (phase !== "question" || answering.current) return;
      answering.current = true;
      const timeLeft = Math.max(
        0,
        roundSec + bonus.current - (performance.now() - startedAt.current) / 1000,
      );
      const next = applyAnswer(run, {
        index,
        total,
        choice,
        correctIndex: q.correctIndex,
        timeLeft,
        roundSec: roundSec + bonus.current,
      });
      const result = next.results[next.results.length - 1];
      setRun(next);
      setPhase("revealed");
      sound(result.correct ? "correct" : result.shielded ? "shield" : "wrong");
      if (result.correct) {
        const mult = comboMultiplier(next.combo);
        setFloater(`+${result.points}${mult > 1 ? ` ×${mult}` : ""}`);
        setTimeout(() => setFloater(null), 1000);
      }
    },
    [phase, run, index, total, q, roundSec, sound],
  );
  const answerRef = useRef(answer);
  answerRef.current = answer;

  // The round timer: running out answers with nothing.
  useEffect(() => {
    if (phase !== "question") return undefined;
    answering.current = false;
    bonus.current = 0;
    setEliminated([]);
    if (isBossRound(index, total)) sound("boss");
    startedAt.current = performance.now();
    setSecs(roundSec);
    const timer = setInterval(() => {
      const left = roundSec + bonus.current - (performance.now() - startedAt.current) / 1000;
      setSecs(Math.max(0, Math.ceil(left)));
      if (left <= 0) answerRef.current(null);
    }, 100);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, index]);

  const next = useCallback(() => {
    if (phase !== "revealed") return;
    const refuelled = refuel(run, index);
    if (refuelled !== run) {
      setRun(refuelled);
      sound("stage");
    }
    if (index + 1 >= total) {
      setPhase("summit");
      sound("summit");
    } else {
      setIndex(index + 1);
      setPhase("question");
    }
  }, [phase, run, index, total, sound]);
  const nextRef = useRef(next);
  nextRef.current = next;

  // A right answer moves on by itself; a miss waits so the explanation gets read.
  useEffect(() => {
    if (phase !== "revealed" || !last?.correct) return undefined;
    const t = setTimeout(() => nextRef.current(), 1000);
    return () => clearTimeout(t);
  }, [phase, last]);

  // Finish: store the personal best and record the result once.
  useEffect(() => {
    if (phase !== "summit") return;
    setNewBest(score > best);
    if (score > best) {
      try {
        localStorage.setItem(bestKey(lesson.id), String(score));
      } catch {
        // See above.
      }
    }
    onFinish?.(correctCount, total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const start = () => {
    setRun(freshRun());
    setIndex(0);
    setNewBest(false);
    setPhase("question");
  };

  const fifty = () => {
    if (phase !== "question" || run.lifelines.fifty < 1 || eliminated.length) return;
    setEliminated(pickEliminated(q.options, q.correctIndex));
    setRun({ ...run, lifelines: { ...run.lifelines, fifty: run.lifelines.fifty - 1 } });
    sound("lifeline");
  };
  const warp = () => {
    if (phase !== "question" || run.lifelines.warp < 1 || bonus.current > 0) return;
    bonus.current += TIME_WARP_SEC;
    setRun({ ...run, lifelines: { ...run.lifelines, warp: run.lifelines.warp - 1 } });
    sound("lifeline");
  };
  const fiftyRef = useRef(fifty);
  fiftyRef.current = fifty;
  const warpRef = useRef(warp);
  warpRef.current = warp;

  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (phase === "question") {
        const k = KEYS.indexOf(e.key);
        if (k >= 0 && k < q.options.length) {
          e.preventDefault();
          if (!eliminated.includes(k)) answerRef.current(k);
        } else if (e.key.toLowerCase() === "f") fiftyRef.current();
        else if (e.key.toLowerCase() === "t") warpRef.current();
      } else if (e.key === "Enter" && phase === "revealed" && !last?.correct) {
        e.preventDefault();
        nextRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, q, eliminated, last]);

  const stages = useMemo(() => {
    const out = [];
    for (let s = 0; s < stageCount(total); s++) {
      const size = Math.min(STAGE_SIZE, total - s * STAGE_SIZE);
      const slice = run.results.slice(s * STAGE_SIZE, (s + 1) * STAGE_SIZE);
      if (slice.length === size) out.push(starsFor(slice.filter((r) => r.correct).length, size));
    }
    return out;
  }, [run.results, total]);

  if (phase === "intro")
    return (
      <div className="rounded-xl border bg-card p-5 text-center">
        <Skull className="mx-auto size-10 text-violet-500" aria-hidden />
        <h3 className="mt-2 text-lg font-semibold">Boss Battle</h3>
        <p className="mx-auto mt-1 max-w-prose text-sm text-muted-foreground">
          Duel the Void Warden with what you just learned. {total} questions in {stageCount(total)}{" "}
          stages; land 70% to defeat the boss. Every 5th question is a boss round worth double. Use
          50/50 (F) and Time Warp (T) wisely, and chain 4 in a row to earn a shield. {roundSec}s per
          question; answer with 1-4.
        </p>
        {best > 0 && <p className="mt-2 text-xs text-muted-foreground">Your best: {best} points</p>}
        <Button className="mt-4" onClick={start}>
          <Swords /> Begin the duel
        </Button>
      </div>
    );

  if (phase === "summit") {
    const defeated = healthAfter(run.results, total).boss <= 0;
    return (
      <div className="space-y-3">
        <Arena results={run.results} total={total} boss={false} />
        <div className="rounded-xl border bg-card p-5 text-center">
          <p className="text-lg font-semibold">{rankFor(run.results, total)}</p>
          <p className="text-sm text-muted-foreground">
            {defeated ? "You defeated the Void Warden." : "The Void Warden is still standing."}
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{score} points</p>
          <p className="text-sm">
            {correctCount} / {total} spells landed · best combo {run.bestCombo}
          </p>
          {newBest && <p className="mt-1 text-sm font-medium text-success">New personal best!</p>}
          <div className="mt-2 flex justify-center gap-4">
            {stages.map((s, i) => (
              <span key={i} className="text-xs">
                Stage {i + 1} <Stars count={s} />
              </span>
            ))}
          </div>
          <Button className="mt-4" onClick={start}>
            Fight again
          </Button>
        </div>
      </div>
    );
  }

  const lowTime = secs <= 5;
  return (
    <div className="space-y-3">
      <Arena results={run.results} total={total} boss={boss} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium">
          Stage {stageOf(index) + 1}/{stageCount(total)} · Question {index + 1}/{total}
        </span>
        <span className="flex items-center gap-3 tabular-nums">
          <span className="relative">
            {score} pts
            {floater && (
              <span className="absolute -top-5 left-0 animate-in fade-in slide-in-from-bottom-2 font-semibold text-success">
                {floater}
              </span>
            )}
          </span>
          {run.combo > 1 && (
            <span className="inline-flex items-center gap-0.5 text-amber-500">
              <Zap className="size-3.5" aria-hidden /> {run.combo} combo
            </span>
          )}
          {run.shields > 0 && (
            <span className="inline-flex items-center gap-0.5 text-info">
              <Shield className="size-3.5" aria-hidden /> {run.shields}
            </span>
          )}
          <span
            className={cn(
              "inline-flex items-center gap-1",
              lowTime && "font-bold text-destructive",
            )}
          >
            <Clock className="size-3.5" aria-hidden /> {secs}s
          </span>
          <button
            type="button"
            className="text-muted-foreground"
            aria-label={muted ? "Unmute sounds" : "Mute sounds"}
            onClick={() => setMuted(!muted)}
          >
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
        </span>
      </div>
      <div className="rounded-xl border bg-card p-4">
        <p className="font-medium">{q.question}</p>
        <div className="mt-3 grid gap-2">
          {q.options.map((o, k) => {
            const open = phase === "question";
            const right = !open && k === q.correctIndex;
            const wrong = !open && last?.answer === k && k !== q.correctIndex;
            return (
              <button
                key={k}
                type="button"
                disabled={!open || eliminated.includes(k)}
                onClick={() => answer(k)}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  open && !eliminated.includes(k) && "hover:bg-accent",
                  eliminated.includes(k) && "line-through opacity-40",
                  right && "border-success bg-success/10",
                  wrong && "border-destructive bg-destructive/10",
                )}
              >
                <kbd className="rounded border px-1.5 text-xs text-muted-foreground">{k + 1}</kbd>
                {o}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={phase !== "question" || run.lifelines.fifty < 1 || eliminated.length > 0}
            onClick={fifty}
          >
            50/50 ({run.lifelines.fifty})
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={phase !== "question" || run.lifelines.warp < 1 || bonus.current > 0}
            onClick={warp}
          >
            <Hourglass /> Time Warp +{TIME_WARP_SEC}s ({run.lifelines.warp})
          </Button>
        </div>
        {phase === "revealed" && last && (
          <div className="mt-3">
            <p
              role="status"
              className={cn(
                "rounded-md p-2 text-sm",
                last.correct ? "bg-success/10" : "bg-destructive/10",
              )}
            >
              {last.correct
                ? "Spell landed! "
                : last.shielded
                  ? "Your shield absorbed the hit. "
                  : last.answer === null
                    ? "Time ran out. "
                    : "The Warden struck back. "}
              {q.explanation}
            </p>
            {!last.correct && (
              <Button className="mt-2" onClick={next}>
                Continue
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
