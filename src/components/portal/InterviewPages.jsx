import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  CameraOff,
  Download,
  FileText,
  Maximize,
  Printer,
  ShieldAlert,
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
import { buildInterviewReportHtml, reportFileName, verdict } from "@/lib/interview-report";
import { saveBlob } from "@/lib/save-file";
import {
  downloadMyResume,
  loadInterviewResult,
  removeInterview,
  removeMyResume,
  reportInterviewViolation,
  saveMyResume,
  startMockInterview,
  submitMockInterview,
} from "@/lib/platform.functions";
import { KEYS, useInterviews, useResume } from "@/lib/use-platform";
import { RoleGate } from "@/components/portal/PortalShell";
import { useCampus } from "@/lib/use-campus";

/** Times a student may leave the interview screen before it ends (the server counts too). */
const MAX_WARNINGS = 3;

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

/**
 * The interview room. It fills the screen when the interview starts, and leaving the screen
 * (another tab or window, or leaving full screen) is a warning; the third one ends the interview.
 */
function InterviewRoom(props) {
  const roomEl = useRef(null);
  return (
    <div
      ref={roomEl}
      className="[&:fullscreen]:h-screen [&:fullscreen]:overflow-y-auto [&:fullscreen]:bg-background [&:fullscreen]:p-6"
    >
      <InterviewSession {...props} roomEl={roomEl} />
    </div>
  );
}

function InterviewSession({ interview, onDone, onExit, roomEl }) {
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
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const finishRef = useRef(null);
  const fullScreenOn = useRef(false); // we asked for full screen, so leaving it counts
  const ended = useRef(false);
  const lastWarning = useRef(0);
  const warningCount = useRef(0);
  const [warning, setWarning] = useState(null); // { count, ended }
  const [confirmEnd, setConfirmEnd] = useState(false);

  const leaveFullScreen = useCallback(() => {
    fullScreenOn.current = false;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }, []);
  const enterFullScreen = useCallback(() => {
    const el = roomEl.current;
    if (!el?.requestFullscreen) return;
    el.requestFullscreen()
      .then(() => {
        fullScreenOn.current = true;
      })
      .catch(() => {});
  }, [roomEl]);

  // One warning each time the student leaves the screen. The server keeps the real count.
  const warn = useCallback(
    async (reason) => {
      const now = Date.now();
      if (ended.current || now - lastWarning.current < 1500) return;
      lastWarning.current = now;
      let count = 0;
      let over = false;
      try {
        const r = await reportInterviewViolation({ data: { id: interview.id, reason } });
        count = r.violations;
        over = r.ended;
      } catch {
        // Offline: count here so the rule still holds.
        count = warningCount.current + 1;
        over = count >= MAX_WARNINGS;
      }
      warningCount.current = count;
      setWarning({ count, ended: over });
      if (over) {
        ended.current = true;
        await finishRef.current?.();
      }
    },
    [interview.id],
  );
  useEffect(() => {
    if (phase !== "live") return;
    const hidden = () => document.hidden && warn("tab-switch");
    const blurred = () => warn("tab-switch");
    const fullscreen = () => {
      if (fullScreenOn.current && !document.fullscreenElement) warn("left-full-screen");
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("blur", blurred);
    document.addEventListener("fullscreenchange", fullscreen);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("blur", blurred);
      document.removeEventListener("fullscreenchange", fullscreen);
    };
  }, [phase, warn]);
  useEffect(() => leaveFullScreen, [leaveFullScreen]);
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
    enterFullScreen(); // must happen straight from the click
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
    leaveFullScreen();
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
          answers: answersRef.current.map((a, i) => ({
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
    else {
      ended.current = false;
      setPhase("live");
    }
  };
  finishRef.current = finish;

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
      <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-ink/75 px-2 py-0.5 text-xs text-white">
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
            <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="flex items-center gap-2 font-medium">
                <ShieldAlert className="size-4 text-primary" aria-hidden /> Exam rules
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                <li>The interview opens in full screen and stays there until you finish.</li>
                <li>Switching tabs or windows, or leaving full screen, gives you a warning.</li>
                <li>After {MAX_WARNINGS} warnings the interview ends and your teacher is told.</li>
              </ul>
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={begin}>
                <Maximize /> Start interview in full screen
              </Button>
              <Button variant="ghost" onClick={onExit}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    );

  const answered = answers.map((a) => Boolean(a.answer.trim() || a.code.trim()));
  return (
    <div className="space-y-3">
      {warning && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Interview warning"
          className="fixed inset-0 z-[70] grid place-items-center bg-black/75 p-4"
        >
          <div className="max-w-md rounded-xl bg-card p-6 text-center shadow-xl">
            <ShieldAlert className="mx-auto size-10 text-primary" aria-hidden />
            {warning.ended ? (
              <>
                <h2 className="mt-3 text-lg font-semibold">Interview ended</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  You left the interview screen {warning.count} times, so the interview was ended
                  and your teacher has been told. Your answers so far are being reviewed.
                </p>
              </>
            ) : (
              <>
                <h2 className="mt-3 text-lg font-semibold">
                  Warning {warning.count} of {MAX_WARNINGS}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  You left the interview screen. Stay in full screen and on this tab. After{" "}
                  {MAX_WARNINGS - warning.count} more the interview ends and your teacher is told.
                </p>
                <Button
                  className="mt-4"
                  onClick={() => {
                    enterFullScreen();
                    setWarning(null);
                  }}
                >
                  <Maximize /> Return to the interview
                </Button>
              </>
            )}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted px-3 py-1.5 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <ShieldAlert className="size-3.5" aria-hidden /> Exam mode: stay on this screen
        </span>
        <span className="inline-flex items-center gap-3">
          <span className="tabular-nums" aria-live="polite">
            Warnings {warning?.count ?? warningCount.current} / {MAX_WARNINGS}
          </span>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={() => {
              dictation.stop();
              setConfirmEnd(true);
            }}
          >
            Finish interview
          </Button>
        </span>
      </div>
      {confirmEnd && (
        <div
          role="alertdialog"
          aria-label="Finish the interview?"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          <p>
            <b>Finish the interview now?</b> You have answered {answered.filter(Boolean).length} of{" "}
            {questions.length} questions. Unanswered questions score 0, and you cannot come back to
            this interview afterwards.
          </p>
          <span className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setConfirmEnd(false)}>
              Keep going
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => {
                setConfirmEnd(false);
                finish();
              }}
            >
              Yes, finish and get feedback
            </Button>
          </span>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium">
          Question {index + 1} of {questions.length}
        </span>
        <StatusPill tone="info">{QUESTION_TYPES[q.type]}</StatusPill>
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          Suggested time <Clock seconds={q.timeSec ?? 180} resetKey={index} />
        </span>
      </div>
      <ProgressBar value={(answered.filter(Boolean).length / questions.length) * 100} />
      <nav aria-label="Questions" className="flex flex-wrap gap-1.5">
        {questions.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Question ${i + 1}${answered[i] ? ", answered" : ""}`}
            aria-current={i === index}
            onClick={() => move(i)}
            className={cn(
              "size-8 rounded-md border text-xs font-medium",
              answered[i] && "border-primary bg-primary/10 text-primary",
              i === index && "ring-2 ring-primary",
            )}
          >
            {i + 1}
          </button>
        ))}
      </nav>
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
    </div>
  );
}

// ---------------------------------------------------------------- result
function ReportButtons({ result }) {
  const { profile, rows } = useCampus();
  const name =
    rows?.find((r) => r.owner_id === profile?.id)?.s?.name || profile?.display_name || "";
  const html = () => buildInterviewReportHtml(result, { name });
  const print = () => {
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;width:0;height:0;border:0;visibility:hidden";
    frame.srcdoc = html();
    frame.onload = () => {
      frame.contentWindow.focus();
      frame.contentWindow.print();
      setTimeout(() => frame.remove(), 60_000);
    };
    document.body.append(frame);
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        onClick={() => saveBlob(new Blob([html()], { type: "text/html" }), reportFileName(result))}
      >
        <Download /> Download report
      </Button>
      <Button type="button" variant="outline" onClick={print}>
        <Printer /> Print / save as PDF
      </Button>
    </div>
  );
}

function Result({ result, recordingUrl, onBack }) {
  const tone = result.overall >= 70 ? "success" : result.overall >= 45 ? "warning" : "danger";
  return (
    <div className="space-y-4">
      {result.terminated && (
        <div
          role="alert"
          className="flex gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4 text-sm"
        >
          <ShieldAlert className="size-5 shrink-0 text-primary" aria-hidden />
          <p>
            This interview was ended early because you left the interview screen {result.violations}{" "}
            times. Your teacher has been told. It was graded on the answers you gave and does not
            count as a mock interview on your record.
          </p>
        </div>
      )}
      <ReportButtons result={result} />
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{result.role} · mock interview</p>
            <p className="text-3xl font-bold tabular-nums">{result.overall}/100</p>
          </div>
          <StatusPill tone={tone}>{verdict(result.overall)}</StatusPill>
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

/** How the student is doing across their finished interviews. */
function Progress({ history }) {
  const graded = history.filter((h) => h.status === "completed" && h.overall !== null);
  if (!graded.length) return null;
  const scores = graded.map((h) => h.overall);
  const average = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const latest = graded[0].overall;
  const change = graded.length > 1 ? latest - graded[1].overall : null;
  const tiles = [
    ["Interviews taken", graded.length],
    ["Average score", `${average}/100`],
    ["Best score", `${Math.max(...scores)}/100`],
    [
      "Latest vs previous",
      change === null ? "First one" : `${change > 0 ? "+" : ""}${change} points`,
    ],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Your interview progress">
      {tiles.map(([label, value]) => (
        <div key={label} className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold tabular-nums">{value}</p>
        </div>
      ))}
    </div>
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
        {history.data && <Progress history={history.data} />}
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
                  disabled={h.status === "started"}
                  className="min-w-0 flex-1 text-left disabled:cursor-default"
                  onClick={() => setMode({ name: "past", id: h.id })}
                >
                  <span className="font-medium">{h.role}</span>{" "}
                  <span className="text-xs text-muted-foreground">
                    {h.difficulty} · {new Date(h.createdAt).toLocaleDateString()}
                  </span>
                </button>
                {h.violations > 0 && (
                  <StatusPill tone="warning">
                    {h.violations} warning{h.violations === 1 ? "" : "s"}
                  </StatusPill>
                )}
                {h.status === "completed" ? (
                  <span className="font-semibold tabular-nums">{h.overall}/100</span>
                ) : h.status === "terminated" ? (
                  <StatusPill tone="danger">Ended early</StatusPill>
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

/** The AI Interview page in the student sidebar. */
export function AiInterviewPage() {
  return (
    <RoleGate allow={["student"]}>
      <div className="mx-auto max-w-5xl space-y-5">
        <header>
          <h1 className="text-[1.75rem] font-semibold leading-9 tracking-tight text-[#00205f]">
            AI Interview
          </h1>
          <p className="text-sm text-muted-foreground">
            A practice interview on camera. It opens in full screen like an exam: leaving the screen
            gives a warning, and after {MAX_WARNINGS} the interview ends and your teacher is told.
            When you finish you can download your report.
          </p>
        </header>
        <MockInterviewHub />
      </div>
    </RoleGate>
  );
}
