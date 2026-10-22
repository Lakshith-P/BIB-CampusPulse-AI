import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  CameraOff,
  Download,
  FileText,
  Mic,
  MicOff,
  Play,
  Trash2,
  Video,
  Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ProgressBar, SectionTitle } from "@/components/widgets";
import {
  ConfirmDialog,
  DownloadButton,
  ErrorState,
  Field,
  FileField,
  PageSkeleton,
  StatusPill,
  inputClass,
  useAction,
} from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { DIFFICULTIES, QUESTION_TYPES, TYPE_KEYS } from "@/lib/interview-prompt";
import { useSpeech } from "@/lib/use-speech";
import {
  downloadMyResume,
  loadInterviewResult,
  removeInterview,
  removeMyResume,
  saveMyResume,
  startMockInterview,
  submitMockInterview,
} from "@/lib/platform.functions";
import { KEYS, useInterviews, useResume } from "@/lib/use-platform";

// ---------------------------------------------------------------- resume
export function ResumeCard() {
  const { data, isLoading, error, refetch } = useResume();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: KEYS.resume });
  const { busy, run } = useAction(refresh);
  const [file, setFile] = useState(null);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  useEffect(() => {
    setText(data?.text ?? "");
  }, [data]);

  if (isLoading) return <PageSkeleton rows={1} />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  return (
    <section className="surface space-y-3 p-4" aria-label="Resume">
      <SectionTitle sub="Your resume is only used to write interview questions about you. Only you can see it.">
        Resume
      </SectionTitle>
      {data && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="inline-flex items-center gap-2">
            <FileText className="size-4 text-muted-foreground" aria-hidden />
            {data.fileName || "Pasted resume text"}
            <span className="text-xs text-muted-foreground">
              · updated {new Date(data.updatedAt).toLocaleDateString()}
            </span>
          </span>
          <span className="flex gap-2">
            {data.fileName && (
              <DownloadButton label="Download" onFetch={() => downloadMyResume()} />
            )}
            <Button size="sm" variant="outline" onClick={() => setEditing(!editing)}>
              {editing ? "Hide text" : "Review text"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Remove resume"
              onClick={() => setRemoving(true)}
            >
              <Trash2 />
            </Button>
          </span>
        </div>
      )}
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await saveMyResume({
              data: { file: file ?? undefined, text: text.trim() ? text : undefined },
            });
            setFile(null);
          }, "Resume saved.");
        }}
      >
        <FileField
          value={file}
          onChange={setFile}
          disabled={busy}
          label={data ? "Replace resume (PDF, Word or TXT)" : "Upload resume (PDF, Word or TXT)"}
        />
        {(editing || !data) && (
          <Field
            label="Resume text"
            hint="We read this from your file. Fix anything that looks wrong, or paste your resume here instead of uploading."
          >
            <Textarea
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={20000}
              disabled={busy}
            />
          </Field>
        )}
        <Button type="submit" size="sm" disabled={busy || (!file && !text.trim())}>
          {file ? "Upload resume" : "Save resume text"}
        </Button>
      </form>
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title="Remove your resume?"
        description="The file and its text are deleted. Resume-based interview questions need it again."
        confirmLabel="Remove"
        onConfirm={() => run(() => removeMyResume(), "Resume removed.")}
      />
    </section>
  );
}

// ---------------------------------------------------------------- the interview room
const SpeechRecognition =
  typeof window !== "undefined"
    ? (window.SpeechRecognition ?? window.webkitSpeechRecognition)
    : null;

/** Dictation into a text box. Falls back to typing where the browser has no recogniser. */
function useDictation(onText) {
  const [listening, setListening] = useState(false);
  const rec = useRef(null);
  const keep = useRef(false);
  const stop = useCallback(() => {
    keep.current = false;
    rec.current?.stop();
    setListening(false);
  }, []);
  const start = useCallback(() => {
    if (!SpeechRecognition) return;
    const r = new SpeechRecognition();
    r.continuous = true;
    r.interimResults = false;
    r.lang = "en-IN";
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++)
        if (e.results[i].isFinal) onText(e.results[i][0].transcript.trim());
    };
    // Browsers end recognition after a pause; keep listening until the learner stops it.
    r.onend = () => (keep.current ? r.start() : setListening(false));
    r.onerror = () => {};
    keep.current = true;
    rec.current = r;
    r.start();
    setListening(true);
  }, [onText]);
  useEffect(() => () => stop(), [stop]);
  return { supported: Boolean(SpeechRecognition), listening, start, stop };
}

function Clock({ seconds, resetKey }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    setLeft(seconds);
    const t = setInterval(() => setLeft((l) => l - 1), 1000);
    return () => clearInterval(t);
  }, [seconds, resetKey]);
  const m = Math.floor(Math.max(0, left) / 60);
  const s = Math.max(0, left) % 60;
  return (
    <span className={cn("tabular-nums", left <= 0 && "font-semibold text-destructive")}>
      {left <= 0 ? "Time's up" : `${m}:${String(s).padStart(2, "0")}`}
    </span>
  );
}

function InterviewRoom({ interview, onDone, onExit }) {
  const { questions } = interview;
  const [phase, setPhase] = useState("prep"); // prep | live | grading
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState(() =>
    questions.map((q) => ({
      index: q.index,
      answer: "",
      code: q.starterCode ?? "",
      language: q.language ?? "",
    })),
  );
  const [camera, setCamera] = useState("asking"); // asking | on | off
  const [speaking, setSpeaking] = useState(false);
  const videoEl = useRef(null);
  const stream = useRef(null);
  const recorder = useRef(null);
  const chunks = useRef([]);
  const { speak, cancel, supported: canSpeak } = useSpeech();
  const { busy, run } = useAction();
  const q = questions[index];
  const current = answers[index];
  const isCoding = q.type === "coding";

  const patch = (change) =>
    setAnswers((all) => all.map((a, i) => (i === index ? { ...a, ...change } : a)));
  const dictation = useDictation(
    useCallback(
      (t) =>
        setAnswers((all) =>
          all.map((a, i) => (i === index ? { ...a, answer: `${a.answer} ${t}`.trim() } : a)),
        ),
      [index],
    ),
  );

  // Camera and microphone: the interview still works, audio-only or typed, if they are refused.
  useEffect(() => {
    let live = true;
    navigator.mediaDevices
      ?.getUserMedia({ video: true, audio: true })
      .then((s) => {
        if (!live) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        setCamera("on");
      })
      .catch(() => live && setCamera("off"));
    return () => {
      live = false;
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  useEffect(() => {
    if (camera === "on" && videoEl.current) videoEl.current.srcObject = stream.current;
  }, [camera, phase]);

  const ask = useCallback(() => {
    if (!canSpeak) return;
    setSpeaking(true);
    speak(q.question, { rate: 1, onEnd: () => setSpeaking(false) });
  }, [canSpeak, speak, q]);
  useEffect(() => {
    if (phase === "live") ask();
    return () => {
      cancel();
      setSpeaking(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, index]);

  const begin = () => {
    if (stream.current && typeof MediaRecorder !== "undefined") {
      try {
        recorder.current = new MediaRecorder(stream.current);
        recorder.current.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
        recorder.current.start(1000);
      } catch {
        recorder.current = null;
      }
    }
    setPhase("live");
  };

  const finish = async () => {
    dictation.stop();
    cancel();
    setPhase("grading");
    let recordingUrl = null;
    if (recorder.current && recorder.current.state !== "inactive") {
      await new Promise((resolve) => {
        recorder.current.onstop = resolve;
        recorder.current.stop();
      });
      if (chunks.current.length)
        recordingUrl = URL.createObjectURL(new Blob(chunks.current, { type: "video/webm" }));
    }
    const r = await run(() =>
      submitMockInterview({
        data: {
          id: interview.id,
          answers: answers.map((a, i) => ({
            ...a,
            code:
              questions[i].type === "coding" && a.code === (questions[i].starterCode ?? "")
                ? ""
                : a.code,
          })),
        },
      }),
    );
    if (r.ok) onDone(r.result, recordingUrl);
    else setPhase("live");
  };

  const move = (to) => {
    dictation.stop();
    setIndex(to);
  };

  if (phase === "grading")
    return (
      <div role="status" className="rounded-xl border bg-card p-8 text-center">
        <p className="font-medium">Your interviewer is reviewing your answers…</p>
        <p className="mt-1 text-sm text-muted-foreground">This can take up to a minute.</p>
      </div>
    );

  const feed = (
    <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-900">
      {camera === "on" ? (
        <video
          ref={videoEl}
          autoPlay
          muted
          playsInline
          className="size-full -scale-x-100 object-cover"
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1 text-sm text-slate-300">
          <CameraOff className="size-6" aria-hidden />
          {camera === "asking"
            ? "Waiting for camera permission…"
            : "Camera not available — you can still continue"}
        </div>
      )}
      <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
        <Camera className="size-3" aria-hidden /> You
      </span>
    </div>
  );

  if (phase === "prep")
    return (
      <div className="space-y-3">
        <div className="grid gap-4 md:grid-cols-2">
          {feed}
          <div className="rounded-xl border bg-card p-4 text-sm">
            <p className="text-base font-semibold">Ready for your {interview.role} interview?</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>{questions.length} questions. The interviewer reads each one aloud.</li>
              <li>Answer out loud (use the mic to turn speech into text) or type.</li>
              <li>Coding questions open an editor: write your code and explain your approach.</li>
              <li>Your video stays on your device. Only your written answers are graded.</li>
            </ul>
            <div className="mt-4 flex gap-2">
              <Button onClick={begin}>
                <Play /> Start interview
              </Button>
              <Button variant="ghost" onClick={onExit}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium">
          Question {index + 1} of {questions.length}
        </span>
        <StatusPill tone="info">{QUESTION_TYPES[q.type]}</StatusPill>
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          Suggested time <Clock seconds={q.timeSec ?? 180} resetKey={index} />
        </span>
      </div>
      <ProgressBar value={(index / questions.length) * 100} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-3">
          {feed}
          <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
            <span
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary",
                speaking && "animate-pulse ring-2 ring-primary",
              )}
              aria-hidden
            >
              <Volume2 className="size-5" />
            </span>
            <p className="min-w-0 flex-1 text-sm">
              {speaking ? "Interviewer is speaking…" : "Your turn to answer."}
            </p>
            {canSpeak && (
              <Button size="sm" variant="outline" onClick={ask}>
                Repeat
              </Button>
            )}
          </div>
        </div>
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <p className="font-medium">{q.question}</p>
          {isCoding && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label htmlFor="lang" className="text-sm font-medium">
                  Language
                </label>
                <Input
                  id="lang"
                  className="max-w-40"
                  value={current.language}
                  onChange={(e) => patch({ language: e.target.value })}
                  maxLength={30}
                />
              </div>
              <textarea
                aria-label="Your code"
                spellCheck={false}
                value={current.code}
                onChange={(e) => patch({ code: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key !== "Tab") return;
                  e.preventDefault();
                  const el = e.currentTarget;
                  const { selectionStart: a, selectionEnd: b } = el;
                  patch({ code: `${current.code.slice(0, a)}  ${current.code.slice(b)}` });
                  requestAnimationFrame(() => el.setSelectionRange(a + 2, a + 2));
                }}
                rows={14}
                maxLength={8000}
                className="w-full rounded-md border bg-slate-950 p-3 font-mono text-sm leading-relaxed text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                Tab inserts two spaces. Your code is reviewed, not run.
              </p>
            </div>
          )}
          <Field label={isCoding ? "Explain your approach and complexity" : "Your answer"}>
            <Textarea
              rows={isCoding ? 3 : 8}
              value={current.answer}
              onChange={(e) => patch({ answer: e.target.value })}
              maxLength={6000}
            />
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {dictation.supported ? (
              <Button
                type="button"
                size="sm"
                variant={dictation.listening ? "default" : "outline"}
                aria-pressed={dictation.listening}
                onClick={dictation.listening ? dictation.stop : dictation.start}
              >
                {dictation.listening ? <MicOff /> : <Mic />}
                {dictation.listening ? "Stop speaking" : "Answer by speaking"}
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">
                Voice input needs Chrome or Edge; type your answer instead.
              </span>
            )}
            <span className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={index === 0}
                onClick={() => move(index - 1)}
              >
                Back
              </Button>
              {index < questions.length - 1 ? (
                <Button type="button" size="sm" onClick={() => move(index + 1)}>
                  Next question
                </Button>
              ) : (
                <Button type="button" size="sm" disabled={busy} onClick={finish}>
                  Finish and get feedback
                </Button>
              )}
            </span>
          </div>
        </div>
      </div>
      {index < questions.length - 1 && (
        <div className="text-right">
          <Button variant="ghost" size="sm" disabled={busy} onClick={finish}>
            End interview early
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- result
function Result({ result, recordingUrl, onBack }) {
  const tone = result.overall >= 70 ? "success" : result.overall >= 45 ? "warning" : "danger";
  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{result.role} · mock interview</p>
            <p className="text-3xl font-bold tabular-nums">{result.overall}/100</p>
          </div>
          <StatusPill tone={tone}>
            {result.overall >= 70
              ? "Interview ready"
              : result.overall >= 45
                ? "Getting there"
                : "Needs practice"}
          </StatusPill>
        </div>
        <p className="mt-2 text-sm">{result.summary}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-sm font-medium">Strengths</p>
            <ul className="list-disc pl-5 text-sm text-muted-foreground">
              {result.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium">Work on</p>
            <ul className="list-disc pl-5 text-sm text-muted-foreground">
              {result.improvements.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          {Object.entries(result.byType).map(([t, score]) => (
            <div key={t} className="grid grid-cols-[10rem_1fr_2.5rem] items-center gap-2 text-xs">
              <span>{QUESTION_TYPES[t]}</span>
              <ProgressBar value={score} />
              <span className="tabular-nums">{score}</span>
            </div>
          ))}
        </div>
        {recordingUrl && (
          <a
            href={recordingUrl}
            download="mock-interview.webm"
            className="mt-3 inline-flex items-center gap-1 text-sm underline underline-offset-2"
          >
            <Download className="size-4" /> Download my recording (saved only on this device)
          </a>
        )}
      </div>
      <ul className="space-y-3">
        {result.questions.map((q) => (
          <li key={q.index} className="rounded-xl border bg-card p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusPill tone="info">{QUESTION_TYPES[q.type]}</StatusPill>
              <span className="font-semibold tabular-nums">{q.score}/10</span>
            </div>
            <p className="mt-2 font-medium">{q.question}</p>
            {q.answer && <p className="mt-1 text-muted-foreground">You said: {q.answer}</p>}
            {q.code && (
              <pre className="mt-2 overflow-x-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
                {q.code}
              </pre>
            )}
            <p className="mt-2">{q.feedback}</p>
            {q.better && (
              <details className="mt-2">
                <summary className="cursor-pointer font-medium">Model answer</summary>
                <pre className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                  {q.better}
                </pre>
              </details>
            )}
          </li>
        ))}
      </ul>
      <Button variant="outline" onClick={onBack}>
        Back to mock interviews
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------- setup + history
function Setup({ hasResume, onStarted }) {
  const [f, setF] = useState({ role: "", difficulty: "medium", count: 8 });
  const [types, setTypes] = useState(TYPE_KEYS.filter((t) => hasResume || t !== "resume"));
  const { busy, run } = useAction();
  const toggle = (t) => setTypes(types.includes(t) ? types.filter((x) => x !== t) : [...types, t]);
  return (
    <form
      className="surface space-y-3 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await run(() =>
          startMockInterview({ data: { ...f, count: Number(f.count), types } }),
        );
        if (r.ok) onStarted(r.result);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Role you are interviewing for">
          <Input
            value={f.role}
            onChange={(e) => setF({ ...f, role: e.target.value })}
            placeholder="e.g. Software Engineer"
            required
            minLength={2}
            maxLength={100}
          />
        </Field>
        <Field label="Difficulty">
          <select
            className={inputClass}
            value={f.difficulty}
            onChange={(e) => setF({ ...f, difficulty: e.target.value })}
          >
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d[0].toUpperCase() + d.slice(1)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Number of questions">
          <select
            className={inputClass}
            value={f.count}
            onChange={(e) => setF({ ...f, count: e.target.value })}
          >
            {[5, 8, 10, 12, 14].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </Field>
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Types of questions</legend>
        <div className="flex flex-wrap gap-2">
          {TYPE_KEYS.map((t) => {
            const disabled = t === "resume" && !hasResume;
            return (
              <label
                key={t}
                className={cn(
                  "flex min-h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm",
                  types.includes(t) && "border-primary bg-primary/10",
                  disabled && "cursor-not-allowed opacity-50",
                )}
                title={disabled ? "Upload your resume to enable this" : undefined}
              >
                <input
                  type="checkbox"
                  className="size-4"
                  checked={types.includes(t)}
                  disabled={disabled}
                  onChange={() => toggle(t)}
                />
                {QUESTION_TYPES[t]}
              </label>
            );
          })}
        </div>
      </fieldset>
      <Button type="submit" disabled={busy || !types.length}>
        <Video />{" "}
        {busy ? "Preparing your interview… this can take a minute" : "Start mock video interview"}
      </Button>
    </form>
  );
}

/** Student placement page section: resume, a new AI video interview, and past results. */
export function MockInterviewHub() {
  const resume = useResume();
  const history = useInterviews();
  const qc = useQueryClient();
  const [mode, setMode] = useState({ name: "home" }); // home | room | result
  const [removing, setRemoving] = useState(null);
  const { run } = useAction(() => qc.invalidateQueries({ queryKey: KEYS.interviews }));
  const viewing = useQuery({
    queryKey: [...KEYS.interviews, mode.id],
    queryFn: () => loadInterviewResult({ data: { id: mode.id } }),
    enabled: mode.name === "past",
  });
  const done = useMemo(
    () => (result, recordingUrl) => {
      qc.invalidateQueries({ queryKey: KEYS.interviews });
      qc.invalidateQueries({ queryKey: ["campus"] });
      setMode({ name: "result", result, recordingUrl });
    },
    [qc],
  );

  if (mode.name === "room")
    return (
      <InterviewRoom
        interview={mode.interview}
        onDone={done}
        onExit={() => setMode({ name: "home" })}
      />
    );
  if (mode.name === "result")
    return (
      <Result
        result={mode.result}
        recordingUrl={mode.recordingUrl}
        onBack={() => setMode({ name: "home" })}
      />
    );
  if (mode.name === "past")
    return viewing.error ? (
      <ErrorState error={viewing.error} onRetry={viewing.refetch} />
    ) : viewing.data ? (
      <Result result={viewing.data} onBack={() => setMode({ name: "home" })} />
    ) : (
      <PageSkeleton rows={2} />
    );

  return (
    <div className="space-y-4">
      <ResumeCard />
      <section className="space-y-3" aria-label="AI mock video interview">
        <SectionTitle sub="A practice interview on camera: spoken questions on your resume, technical topics, coding, HR, situations and aptitude, graded with feedback.">
          AI mock video interview
        </SectionTitle>
        <Setup
          key={String(Boolean(resume.data))}
          hasResume={Boolean(resume.data)}
          onStarted={(interview) => setMode({ name: "room", interview })}
        />
        {history.error ? (
          <ErrorState error={history.error} onRetry={history.refetch} />
        ) : !history.data?.length ? (
          <EmptyState title="No mock interviews yet" hint="Your graded interviews appear here." />
        ) : (
          <ul className="divide-y rounded-xl border bg-card text-sm">
            {history.data.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <button
                  type="button"
                  disabled={h.status !== "completed"}
                  className="min-w-0 flex-1 text-left disabled:cursor-default"
                  onClick={() => setMode({ name: "past", id: h.id })}
                >
                  <span className="font-medium">{h.role}</span>{" "}
                  <span className="text-xs text-muted-foreground">
                    {h.difficulty} · {new Date(h.createdAt).toLocaleDateString()}
                  </span>
                </button>
                {h.status === "completed" ? (
                  <span className="font-semibold tabular-nums">{h.overall}/100</span>
                ) : (
                  <StatusPill tone="neutral">Not finished</StatusPill>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Delete ${h.role} interview`}
                  onClick={() => setRemoving(h)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Delete this interview?"
        description="Its questions, answers and feedback are removed. The score stays in your mock interview count."
        confirmLabel="Delete"
        onConfirm={() =>
          run(() => removeInterview({ data: { id: removing.id } }), "Interview deleted.")
        }
      />
    </div>
  );
}
