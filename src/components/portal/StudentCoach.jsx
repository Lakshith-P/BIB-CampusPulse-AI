import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowUp,
  BarChart3,
  Lightbulb,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
  TriangleAlert,
  Trophy,
  Users,
} from "lucide-react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Answer } from "@/components/portal/AnalyticsCopilot";
import { askStudentCoach, loadCoachSuggestions } from "@/lib/student-coach.functions";

const PROMPT_ICONS = [Users, Trophy, BarChart3, Target, Lightbulb];

/**
 * The chat on the student's Predictive Risk & AI page. The student asks how they compare with
 * classmates and the university, who is ahead (anonymously) and what to do to improve. Every answer
 * comes with the tables it was built from.
 */
export function StudentCoach() {
  const [turns, setTurns] = useState([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const endRef = useRef(null);
  const { data: hints } = useQuery({
    queryKey: ["coach-suggestions"],
    queryFn: () => loadCoachSuggestions(),
    staleTime: 5 * 60_000,
  });
  const ask = useMutation({
    mutationFn: (question) =>
      askStudentCoach({
        data: {
          question,
          messages: turns.flatMap((t) => [
            { role: "user", content: t.question },
            { role: "assistant", content: t.answer },
          ]),
        },
      }),
    onSuccess: (res, question) => {
      setError("");
      setTurns((t) => [...t, { id: `c${t.length + 1}`, question, ...res }]);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Something went wrong."),
  });
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, ask.isPending]);

  function submit(question = draft) {
    const q = question.trim();
    if (q.length < 3 || ask.isPending) return;
    setDraft("");
    setError("");
    ask.mutate(q);
  }
  const empty = turns.length === 0 && !ask.isPending;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 font-medium text-success">
            <ShieldCheck className="size-3.5" /> Other students stay anonymous
          </span>
          {hints
            ? `Comparing you with ${hints.students} student${hints.students === 1 ? "" : "s"} across the university.`
            : "Comparing you with students across the university."}
        </p>
        {turns.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setTurns([]);
              setError("");
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-rule px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <RotateCcw className="size-3.5" /> New conversation
          </button>
        )}
      </div>

      {empty && (
        <section className="rounded-2xl border border-rule bg-gradient-to-br from-primary/[0.06] via-card to-card p-6 sm:p-8">
          <span className="grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Sparkles className="size-6" />
          </span>
          <h2 className="mt-4 font-display text-xl font-semibold tracking-tight">Ask your coach</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            See where you stand against your class, your branch and the whole university, find out
            who is ahead of you and what they do differently, and get a plan to improve. Names and
            IDs of other students are never shown.
          </p>
          <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
            {(hints?.list ?? []).map((q, i) => {
              const Icon = PROMPT_ICONS[i % PROMPT_ICONS.length];
              return (
                <button
                  key={q}
                  type="button"
                  onClick={() => submit(q)}
                  className="group flex items-start gap-3 rounded-xl border border-rule bg-card p-3.5 text-left text-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                >
                  <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{q}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div className="space-y-8" aria-live="polite">
        {turns.map((t) => (
          <article key={t.id} className="space-y-4">
            <div className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm">
                {t.question}
              </p>
            </div>
            <Answer turn={t} />
            {t.note && (
              <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                {t.note}
              </p>
            )}
          </article>
        ))}
        {ask.isPending && (
          <article className="space-y-4">
            <div className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm">
                {ask.variables}
              </p>
            </div>
            <div className="rounded-2xl rounded-tl-sm border border-rule bg-card p-5 text-sm">
              <Shimmer>Comparing you with other students and checking the numbers…</Shimmer>
            </div>
          </article>
        )}
        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="sticky bottom-3 mt-8 rounded-2xl border border-rule bg-card/95 p-2 shadow-lg backdrop-blur"
      >
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            maxLength={600}
            aria-label="Ask your coach"
            placeholder="e.g. Who is better than me in coding, and what should I do to catch up?"
            className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={ask.isPending || draft.trim().length < 3}
            aria-label="Send question"
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
          >
            <ArrowUp className="size-5" />
          </button>
        </div>
        <p className="px-3 pb-1 pt-0.5 text-[0.7rem] text-muted-foreground">
          Enter to send · Shift+Enter for a new line · A rank is a snapshot, not a verdict.
        </p>
      </form>
    </div>
  );
}
