import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  BarChart3,
  ChevronDown,
  FileSearch,
  Lightbulb,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";
import { MessageResponse } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { PageTitle } from "@/components/portal/PortalShell";
import { askAnalyticsCopilot, loadCopilotSuggestions } from "@/lib/copilot.functions";
import { cn } from "@/lib/utils";

const BAND_CLASS = {
  "On Track": "bg-success/15 text-success",
  Monitor: "bg-warning/20 text-warning-foreground",
  "Needs Attention": "bg-ochre-pale text-ochre-ink",
  "High Priority": "bg-destructive/15 text-destructive",
};

function Cell({ column, row }) {
  const value = row[column.key];
  if (value === null || value === undefined || value === "")
    return <span className="text-muted-foreground">—</span>;
  switch (column.kind) {
    case "student":
      return row.id ? (
        <Link
          to="/portal/students/$id"
          params={{ id: row.id }}
          className="font-medium text-primary hover:underline"
        >
          {value}
        </Link>
      ) : (
        value
      );
    case "band":
      return (
        <span
          className={cn(
            "inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold",
            BAND_CLASS[value] ?? "bg-muted text-muted-foreground",
          )}
        >
          {value}
        </span>
      );
    case "percent":
      return (
        <span className={cn("tabular-nums", value < 75 && "font-semibold text-destructive")}>
          {value}%
        </span>
      );
    case "score":
      return <span className="font-semibold tabular-nums">{value}</span>;
    case "number":
      return <span className="tabular-nums">{value}</span>;
    default:
      return value;
  }
}

/** One table of real rows behind an answer, with the question it was computed for. */
function EvidenceCard({ evidence, messageId, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef(null);
  useEffect(() => {
    const onOpen = (e) => {
      if (e.detail === `${messageId}-${evidence.id}`) {
        setOpen(true);
        ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        ref.current?.classList.add("copilot-flash");
        setTimeout(() => ref.current?.classList.remove("copilot-flash"), 1600);
      }
    };
    window.addEventListener("copilot-evidence", onOpen);
    return () => window.removeEventListener("copilot-evidence", onOpen);
  }, [evidence.id, messageId]);
  return (
    <div
      ref={ref}
      id={`${messageId}-${evidence.id}`}
      className="overflow-hidden rounded-xl border border-rule bg-card transition-shadow"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/50"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-xs font-bold text-primary">
          {evidence.id}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{evidence.title}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {evidence.description}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="border-t border-rule">
          <div className="max-h-80 overflow-auto">
            <table className="w-full min-w-max text-sm">
              <thead className="sticky top-0 bg-secondary/80 text-left text-xs uppercase tracking-wide text-muted-foreground backdrop-blur">
                <tr>
                  {evidence.columns.map((c) => (
                    <th key={c.key} className="px-4 py-2 font-medium">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {evidence.rows.map((row, i) => (
                  <tr key={i} className="hover:bg-secondary/40">
                    {evidence.columns.map((c) => (
                      <td key={c.key} className="px-4 py-2 align-top">
                        <Cell column={c} row={row} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-rule bg-secondary/30 px-4 py-2 text-xs text-muted-foreground">
            Showing {evidence.rows.length} of {evidence.total} row{evidence.total === 1 ? "" : "s"}{" "}
            · read directly from the platform records you can access
          </p>
        </div>
      )}
    </div>
  );
}

function Answer({ turn }) {
  const cited = turn.evidence.filter((e) => e.cited);
  const other = turn.evidence.filter((e) => !e.cited);
  const components = {
    // [E1] markers in the answer become buttons that open and highlight their evidence table.
    a: ({ href, children }) =>
      href?.startsWith("#ev-") ? (
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("copilot-evidence", { detail: `${turn.id}-${href.slice(4)}` }),
            )
          }
          className="mx-0.5 inline-flex -translate-y-px items-center rounded bg-primary/10 px-1.5 text-[0.7rem] font-bold text-primary hover:bg-primary/20"
        >
          {children}
        </button>
      ) : (
        <a href={href}>{children}</a>
      ),
  };
  const text = turn.answer.replace(/\[(E\d+(?:\s*,\s*E\d+)*)\]/g, (_, ids) =>
    ids
      .split(/\s*,\s*/)
      .map((id) => `[${id}](#ev-${id})`)
      .join(""),
  );
  return (
    <div className="space-y-4">
      <div className="copilot-answer rounded-2xl rounded-tl-sm border border-rule bg-card p-5 text-sm leading-relaxed shadow-sm">
        <MessageResponse components={components}>{text}</MessageResponse>
      </div>
      {turn.evidence.length > 0 ? (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <FileSearch className="size-3.5" />
            Evidence behind this answer
          </p>
          {cited.map((e) => (
            <EvidenceCard key={e.id} evidence={e} messageId={turn.id} defaultOpen />
          ))}
          {other.length > 0 && (
            <>
              <p className="pt-1 text-xs text-muted-foreground">Also consulted</p>
              {other.map((e) => (
                <EvidenceCard key={e.id} evidence={e} messageId={turn.id} defaultOpen={false} />
              ))}
            </>
          )}
        </div>
      ) : (
        <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          No data tables were consulted for this reply, so treat it as general guidance rather than
          a finding about your students.
        </p>
      )}
    </div>
  );
}

const PROMPT_ICONS = [Users, BarChart3, Lightbulb, ShieldCheck, FileSearch];

export function AnalyticsCopilotPage() {
  const [turns, setTurns] = useState([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const endRef = useRef(null);
  const { data: hints } = useQuery({
    queryKey: ["copilot-suggestions"],
    queryFn: () => loadCopilotSuggestions(),
    staleTime: 5 * 60_000,
  });
  const ask = useMutation({
    mutationFn: (question) =>
      askAnalyticsCopilot({
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
      setTurns((t) => [...t, { id: `m${t.length + 1}`, question, ...res }]);
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
      <PageTitle
        title="Analytics Copilot"
        sub="Ask about student performance in plain language. Every answer is computed from the records you can access and comes with the evidence behind it."
      >
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
      </PageTitle>

      {hints && (
        <p className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 font-medium text-success">
            <ShieldCheck className="size-3.5" /> Read-only
          </span>
          Answering from {hints.students} student record{hints.students === 1 ? "" : "s"} —{" "}
          {hints.scope}. The Copilot advises; it never changes data.
        </p>
      )}

      {empty && (
        <section className="rounded-2xl border border-rule bg-gradient-to-br from-primary/[0.06] via-card to-card p-6 sm:p-8">
          <span className="grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Sparkles className="size-6" />
          </span>
          <h2 className="mt-4 font-display text-xl font-semibold tracking-tight">
            What would you like to understand?
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Ask who needs help, why scores are falling, or how groups compare. You will get a direct
            answer, recommended actions, and the exact tables the answer came from.
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
          {hints && hints.students === 0 && (
            <p className="mt-5 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
              There are no student records in your scope yet, so the Copilot has nothing to analyse.
            </p>
          )}
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
              <Shimmer>Reading your student records and checking the numbers…</Shimmer>
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
            aria-label="Ask the Analytics Copilot"
            placeholder="e.g. Which CSE students in semester 5 are at risk, and why?"
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
          Enter to send · Shift+Enter for a new line · Check the evidence before acting on advice.
        </p>
      </form>
    </div>
  );
}
