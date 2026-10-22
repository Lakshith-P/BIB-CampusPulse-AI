import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Repeat,
  Sparkles,
  Trash2,
  Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, ProgressBar, SectionTitle } from "@/components/widgets";
import {
  ConfirmDialog,
  ErrorState,
  Field,
  StatusPill,
  inputClass,
  useAction,
} from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { QUESTIONS, describeProfile } from "@/lib/ai-lesson-profile";
import { useSpeech } from "@/lib/use-speech";
import {
  createAiLesson,
  loadAiLesson,
  removeAiLesson,
  saveAiQuiz,
  saveLearningProfile,
} from "@/lib/platform.functions";
import { KEYS, useAiLessons, useLearningProfile } from "@/lib/use-platform";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BossBattle } from "@/components/portal/AiLessonGame";

// ---------------------------------------------------------------- questionnaire
function Questionnaire({ initial, onDone, onCancel }) {
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState({});
  const { busy, run } = useAction(onDone);
  const q = QUESTIONS[step];
  const chosen = picked[q.id] ?? [];
  const toggle = (optionId) =>
    setPicked({
      ...picked,
      [q.id]: chosen.includes(optionId)
        ? chosen.filter((o) => o !== optionId)
        : [...chosen, optionId],
    });
  const last = step === QUESTIONS.length - 1;
  return (
    <section
      className="rounded-xl border bg-card p-4 sm:p-5"
      aria-label="Learning-style questionnaire"
    >
      <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          {q.category} · Question {step + 1} of {QUESTIONS.length}
        </span>
        {initial && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
      <ProgressBar value={((step + 1) / QUESTIONS.length) * 100} />
      <h3 className="mt-4 text-base font-semibold">{q.text}</h3>
      <p className="text-xs text-muted-foreground">Pick every answer that fits you.</p>
      <div className="mt-3 grid gap-2">
        {q.options.map((o) => {
          const on = chosen.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => toggle(o.id)}
              className={cn(
                "min-h-11 rounded-lg border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "border-primary bg-primary/10 font-medium" : "hover:bg-accent",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={step === 0}
          onClick={() => setStep(step - 1)}
        >
          Back
        </Button>
        {last ? (
          <Button
            type="button"
            disabled={busy || !chosen.length}
            onClick={() =>
              run(
                () =>
                  saveLearningProfile({
                    data: {
                      answers: QUESTIONS.map((x) => ({
                        questionId: x.id,
                        optionIds: picked[x.id] ?? [],
                      })),
                    },
                  }),
                "Learning profile saved.",
              )
            }
          >
            Build my profile
          </Button>
        ) : (
          <Button type="button" disabled={!chosen.length} onClick={() => setStep(step + 1)}>
            Next
          </Button>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- the board player
const estimateSeconds = (script, speed) =>
  Math.max(4, script.split(/\s+/).filter(Boolean).length / (2.5 * Math.max(0.5, speed)));

/** Spreads the board's terms, notes and diagram nodes evenly across the narration. */
function boardEvents(board, duration) {
  const nodes = board.diagram?.type !== "none" ? (board.diagram?.nodes ?? []) : [];
  const items = [
    ...board.keyTerms.map((_, index) => ({ kind: "term", index })),
    ...board.notes.map((_, index) => ({ kind: "note", index })),
    ...nodes.map((_, index) => ({ kind: "node", index })),
  ];
  const step = duration / (items.length + 1);
  return items.map((item, i) => ({ ...item, at: step * (i + 1), until: step * (i + 2) }));
}

const SHOW_ALL = Number.POSITIVE_INFINITY;

function Board({ slide, elapsed, duration }) {
  const board = slide.board;
  const nodes = board.diagram?.type !== "none" ? (board.diagram?.nodes ?? []) : [];
  const events = useMemo(() => boardEvents(board, duration), [board, duration]);
  const seen = (kind, index) =>
    events.some((e) => e.kind === kind && e.index === index && elapsed >= e.at);
  const active = (kind, index) =>
    events.some(
      (e) => e.kind === kind && e.index === index && elapsed >= e.at && elapsed < e.until,
    );
  const appear = "animate-in fade-in slide-in-from-left-2 duration-500";
  return (
    <div className="relative min-h-72 overflow-hidden rounded-xl border border-white/10 bg-slate-900 p-5 text-slate-100 sm:p-6">
      <h3 className="text-xl font-bold sm:text-2xl">{slide.title}</h3>
      <div className="mb-4 mt-1 h-1 w-24 rounded-full bg-cyan-400" />
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-4">
          <ul className="space-y-2">
            {board.keyTerms.map(
              (term, i) =>
                seen("term", i) && (
                  <li key={i} className={cn("flex items-center gap-2 text-base", appear)}>
                    <span
                      className={cn(
                        "size-2.5 shrink-0 rounded-full",
                        active("term", i) ? "bg-cyan-300" : "bg-cyan-400/60",
                      )}
                    />
                    <span className={active("term", i) ? "text-cyan-200" : "text-slate-200"}>
                      {term}
                    </span>
                  </li>
                ),
            )}
          </ul>
          <div className="space-y-1.5 border-l-2 border-violet-400/40 pl-3">
            {board.notes.map(
              (note, i) =>
                seen("note", i) && (
                  <p
                    key={i}
                    className={cn(
                      "text-sm leading-relaxed",
                      appear,
                      active("note", i) ? "text-slate-100" : "text-slate-400",
                    )}
                  >
                    ✎ {note}
                  </p>
                ),
            )}
          </div>
        </div>
        {nodes.length > 0 && (
          <div
            className={cn(
              "flex gap-2",
              board.diagram.type === "compare" ? "flex-wrap" : "flex-col items-stretch",
            )}
          >
            {nodes.map(
              (node, i) =>
                seen("node", i) && (
                  <div
                    key={i}
                    className={cn(
                      "rounded-lg border-2 px-3 py-2 text-center text-sm font-semibold",
                      appear,
                      i % 2
                        ? "border-cyan-400 bg-cyan-500/10"
                        : "border-indigo-400 bg-indigo-500/15",
                      active("node", i) && "ring-2 ring-cyan-300/70",
                      board.diagram.type === "compare" && "flex-1 basis-2/5",
                    )}
                  >
                    {["flow", "cycle", "timeline", "hierarchy"].includes(board.diagram.type) &&
                      i > 0 && <span className="mr-1 text-cyan-300">↓</span>}
                    {node}
                  </div>
                ),
            )}
            {board.diagram.type === "cycle" && nodes.every((_, i) => seen("node", i)) && (
              <p className="text-center text-xs text-violet-300">↻ loops back to the start</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Player({ lesson }) {
  const slides = lesson.content.slides;
  const speed = lesson.traits.pace === "slow" ? 0.9 : lesson.traits.pace === "fast" ? 1.1 : 1;
  const [current, setCurrent] = useState(0);
  const [elapsed, setElapsed] = useState(SHOW_ALL);
  const [playing, setPlaying] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const frame = useRef(null);
  const { supported, speak, cancel } = useSpeech();
  const slide = slides[current];
  const duration = useMemo(() => estimateSeconds(slide.script, speed), [slide, speed]);

  const stopClock = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };
  const stop = () => {
    stopClock();
    cancel();
  };
  const goTo = (i) => {
    if (i < 0 || i >= slides.length) return;
    stop();
    setPlaying(false);
    setElapsed(SHOW_ALL);
    setCurrent(i);
  };

  // Narrate the current slide and drive the board clock while playing.
  useEffect(() => {
    if (!playing) return undefined;
    if (!supported) {
      setElapsed(SHOW_ALL);
      return undefined;
    }
    let cancelled = false;
    const startedAt = performance.now();
    setElapsed(0);
    const tick = () => {
      if (cancelled) return;
      setElapsed((performance.now() - startedAt) / 1000);
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    speak(slide.script, {
      rate: speed,
      onEnd: () => {
        stopClock();
        setElapsed(SHOW_ALL);
        if (autoAdvance && current < slides.length - 1) setCurrent(current + 1);
        else setPlaying(false);
      },
    });
    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, current]);

  useEffect(() => stop, []); // eslint-disable-line react-hooks/exhaustive-deps

  const progress = elapsed === SHOW_ALL ? 1 : Math.min(1, elapsed / duration);
  return (
    <div className="space-y-3">
      <Board slide={slide} elapsed={elapsed} duration={duration} />
      <ProgressBar value={((current + progress) / slides.length) * 100} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous slide"
            disabled={current === 0}
            onClick={() => goTo(current - 1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            size="icon"
            aria-label={playing ? "Pause" : "Play"}
            onClick={() => {
              if (playing) {
                stop();
                setPlaying(false);
              } else setPlaying(true);
            }}
          >
            {playing ? <Pause /> : <Play />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Replay slide"
            onClick={() => {
              stop();
              setPlaying(false);
              requestAnimationFrame(() => setPlaying(true));
            }}
          >
            <Repeat />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next slide"
            disabled={current === slides.length - 1}
            onClick={() => goTo(current + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="tabular-nums">
            Slide {current + 1} / {slides.length}
          </span>
          <span className="inline-flex items-center gap-1">
            <Volume2 className="size-3.5" aria-hidden />
            {supported ? "Browser voice" : "No voice available"}
          </span>
          <button
            type="button"
            aria-pressed={autoAdvance}
            onClick={() => setAutoAdvance(!autoAdvance)}
            className={cn(
              "min-h-8 rounded-full border px-2.5",
              autoAdvance && "border-primary text-primary",
            )}
          >
            Auto-play {autoAdvance ? "on" : "off"}
          </button>
        </div>
      </div>
      <details className="rounded-lg border p-3 text-sm">
        <summary className="cursor-pointer font-medium">Slide points and transcript</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {slide.points.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
        <p className="mt-3 text-muted-foreground">{slide.script}</p>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------- quiz
function Quiz({ lesson, onSaved }) {
  const quiz = lesson.content.quiz;
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [pick, setPick] = useState(null);
  const [finished, setFinished] = useState(false);
  const { run } = useAction(onSaved);
  const q = quiz[i];
  if (finished)
    return (
      <div className="rounded-xl border bg-card p-4 text-center">
        <p className="text-lg font-semibold">
          You scored {score} / {quiz.length}
        </p>
        <Button
          className="mt-3"
          variant="outline"
          onClick={() => {
            setI(0);
            setScore(0);
            setPick(null);
            setFinished(false);
          }}
        >
          Try again
        </Button>
      </div>
    );
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">
        Question {i + 1} of {quiz.length}
      </p>
      <p className="mt-1 font-medium">{q.question}</p>
      <div className="mt-3 grid gap-2">
        {q.options.map((o, k) => {
          const right = pick !== null && k === q.correctIndex;
          const wrong = pick === k && k !== q.correctIndex;
          return (
            <button
              key={k}
              type="button"
              disabled={pick !== null}
              onClick={() => {
                setPick(k);
                if (k === q.correctIndex) setScore(score + 1);
              }}
              className={cn(
                "min-h-11 rounded-lg border px-3 py-2 text-left text-sm",
                pick === null && "hover:bg-accent",
                right && "border-success bg-success/10",
                wrong && "border-destructive bg-destructive/10",
              )}
            >
              {o}
            </button>
          );
        })}
      </div>
      {pick !== null && (
        <>
          <p className="mt-3 rounded-md bg-accent p-2 text-sm text-accent-foreground">
            {q.explanation}
          </p>
          <Button
            className="mt-3"
            onClick={async () => {
              if (i < quiz.length - 1) {
                setI(i + 1);
                setPick(null);
              } else {
                setFinished(true);
                await run(() => saveAiQuiz({ data: { id: lesson.id, score, total: quiz.length } }));
              }
            }}
          >
            {i < quiz.length - 1 ? "Next question" : "See my score"}
          </Button>
        </>
      )}
    </div>
  );
}

function LessonView({ id, onBack }) {
  const qc = useQueryClient();
  const {
    data: lesson,
    error,
    refetch,
  } = useQuery({
    queryKey: [...KEYS.aiLessons, id],
    queryFn: () => loadAiLesson({ data: { id } }),
  });
  const [mode, setMode] = useState("watch");
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!lesson) return <p role="status">Loading lesson…</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">{lesson.title}</p>
          <p className="text-xs text-muted-foreground">
            {lesson.subject} · {lesson.topic}
          </p>
        </div>
        <div className="flex gap-2">
          {[
            ["watch", "Watch"],
            ["quiz", "Quiz"],
            ["game", "Boss Battle"],
          ].map(([key, label]) => (
            <Button
              key={key}
              size="sm"
              variant={mode === key ? "default" : "outline"}
              aria-pressed={mode === key}
              onClick={() => setMode(key)}
            >
              {label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={onBack}>
            All lessons
          </Button>
        </div>
      </div>
      {mode === "game" ? (
        <BossBattle
          key={lesson.id}
          lesson={lesson}
          onFinish={(score, total) =>
            saveAiQuiz({ data: { id: lesson.id, score, total } })
              .then(() => qc.invalidateQueries({ queryKey: KEYS.aiLessons }))
              .catch(() => {})
          }
        />
      ) : mode === "watch" ? (
        <>
          <p className="text-sm text-muted-foreground">{lesson.content.summary}</p>
          <Player lesson={lesson} />
        </>
      ) : (
        <Quiz lesson={lesson} onSaved={() => qc.invalidateQueries({ queryKey: KEYS.aiLessons })} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- generate + list
function GenerateForm({ subjects, onCreated }) {
  const [f, setF] = useState({
    subject: subjects[0],
    unit: "",
    topic: "",
    focus: "",
    detailLevel: "standard",
  });
  const { busy, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await run(
          () =>
            createAiLesson({
              data: {
                subject: f.subject,
                unit: f.unit ? Number(f.unit) : undefined,
                topic: f.topic,
                focus: f.focus,
                detailLevel: f.detailLevel,
              },
            }),
          "Your personalised lesson is ready.",
        );
        if (r.ok) {
          setF({ ...f, topic: "", focus: "" });
          onCreated(r.result.id);
        }
      }}
    >
      <Field label="Subject">
        <select className={inputClass} value={f.subject} onChange={set("subject")}>
          {subjects.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Field>
      <Field label="Unit (optional)" hint="Grounds the lesson in that unit's syllabus.">
        <select className={inputClass} value={f.unit} onChange={set("unit")}>
          <option value="">Any</option>
          {[1, 2, 3, 4, 5, 6].map((u) => (
            <option key={u} value={u}>
              Unit {u}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Topic">
        <Input value={f.topic} onChange={set("topic")} required minLength={3} maxLength={150} />
      </Field>
      <Field label="Explanation depth">
        <select className={inputClass} value={f.detailLevel} onChange={set("detailLevel")}>
          <option value="quick">Quick</option>
          <option value="standard">Standard</option>
          <option value="detailed">In-depth</option>
        </select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Anything specific to focus on? (optional)">
          <Input value={f.focus} onChange={set("focus")} maxLength={300} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={busy}>
          <Sparkles /> {busy ? "Writing your lesson… this can take a minute" : "Create my lesson"}
        </Button>
      </div>
    </form>
  );
}

export function AiLessonsPanel({ subjects }) {
  const profile = useLearningProfile();
  const lessons = useAiLessons();
  const qc = useQueryClient();
  const [retake, setRetake] = useState(false);
  const [open, setOpen] = useState(null);
  const [removing, setRemoving] = useState(null);
  const { run } = useAction(() => qc.invalidateQueries({ queryKey: KEYS.aiLessons }));
  const refreshProfile = () => {
    setRetake(false);
    return qc.invalidateQueries({ queryKey: KEYS.learningProfile });
  };

  if (profile.error) return <ErrorState error={profile.error} onRetry={profile.refetch} />;
  if (profile.isLoading) return <p role="status">Loading…</p>;

  return (
    <section className="space-y-4" aria-label="Personalised AI video lessons">
      <SectionTitle sub="A narrated board lesson written for how you learn, on any topic in your subjects.">
        Personalised AI lessons
      </SectionTitle>
      {!profile.data || retake ? (
        <>
          {!profile.data && (
            <p className="text-sm text-muted-foreground">
              Answer 20 quick questions once so every lesson is shaped around you: pace, depth, tone
              and examples.
            </p>
          )}
          <Questionnaire
            initial={Boolean(profile.data)}
            onDone={refreshProfile}
            onCancel={() => setRetake(false)}
          />
        </>
      ) : open ? (
        <LessonView id={open} onBack={() => setOpen(null)} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {describeProfile(profile.data.traits).map((label) => (
              <StatusPill key={label} tone="info">
                {label}
              </StatusPill>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setRetake(true)}>
              Retake questionnaire
            </Button>
          </div>
          <GenerateForm
            subjects={subjects}
            onCreated={(id) => {
              qc.invalidateQueries({ queryKey: KEYS.aiLessons });
              setOpen(id);
            }}
          />
          {lessons.error ? (
            <ErrorState error={lessons.error} onRetry={lessons.refetch} />
          ) : !lessons.data?.length ? (
            <EmptyState
              title="No lessons yet"
              hint="Pick a topic above and your first lesson is generated in about a minute."
            />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {lessons.data.map((l) => (
                <li
                  key={l.id}
                  className="flex items-start justify-between gap-2 rounded-lg border bg-card p-3"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setOpen(l.id)}
                  >
                    <p className="truncate font-medium">{l.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {l.subject}
                      {l.unit ? ` · Unit ${l.unit}` : ""} · {l.slides} slides
                      {l.quizBest !== null ? ` · Quiz best ${l.quizBest}/${l.quizTotal}` : ""}
                    </p>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${l.title}`}
                    onClick={() => setRemoving(l)}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Delete this lesson?"
        description="The lesson and your quiz result are removed. You can generate it again any time."
        confirmLabel="Delete"
        onConfirm={() =>
          run(() => removeAiLesson({ data: { id: removing.id } }), "Lesson deleted.")
        }
      />
    </section>
  );
}
