import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, ProgressBar, SectionTitle } from "@/components/widgets";
import { ErrorState, PageSkeleton, StatusPill } from "@/components/ui-kit";
import { loadStudentInterviewResult, loadStudentInterviews } from "@/lib/platform.functions";
import { QUESTION_TYPES } from "@/lib/interview-prompt";
import { buildInterviewReportHtml, reportFileName, verdict } from "@/lib/interview-report";
import { saveBlob } from "@/lib/save-file";

/** One interview in full: the score, what to work on, and each answer with its feedback. */
function InterviewDetail({ id, name }) {
  const { data, error, refetch } = useQuery({
    queryKey: ["student-interview", id],
    queryFn: () => loadStudentInterviewResult({ data: { id } }),
  });
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data) return <PageSkeleton rows={1} />;
  return (
    <div className="space-y-3 border-t bg-muted/30 p-3 text-sm">
      {data.terminated && (
        <p className="flex gap-2 rounded-md border border-primary/40 bg-primary/5 p-2">
          <ShieldAlert className="size-4 shrink-0 text-primary" aria-hidden />
          Ended early: the student left the interview screen {data.violations} times.
        </p>
      )}
      <p>{data.summary}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="font-medium">Strengths</p>
          <ul className="list-disc pl-5 text-muted-foreground">
            {data.strengths.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-medium">Work on</p>
          <ul className="list-disc pl-5 text-muted-foreground">
            {data.improvements.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="space-y-1">
        {Object.entries(data.byType).map(([t, score]) => (
          <div key={t} className="grid grid-cols-[10rem_1fr_2.5rem] items-center gap-2 text-xs">
            <span>{QUESTION_TYPES[t] ?? t}</span>
            <ProgressBar value={score} />
            <span className="tabular-nums">{score}</span>
          </div>
        ))}
      </div>
      <ul className="space-y-2">
        {data.questions.map((q) => (
          <li key={q.index} className="rounded-md border bg-card p-2">
            <p className="flex justify-between gap-2 font-medium">
              <span>{q.question}</span>
              <span className="tabular-nums">{q.score}/10</span>
            </p>
            <p className="text-muted-foreground">{q.answer || "Not answered"}</p>
            <p>{q.feedback}</p>
          </li>
        ))}
      </ul>
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          saveBlob(
            new Blob([buildInterviewReportHtml(data, { name })], { type: "text/html" }),
            reportFileName(data),
          )
        }
      >
        <Download /> Download report
      </Button>
    </div>
  );
}

/**
 * A student's AI mock interviews, for their assigned teacher or an administrator: the score, the
 * verdict, and a warning when the student left the interview screen (three times ends it).
 */
export function StaffInterviews({ studentId, name }) {
  const { data, error, refetch } = useQuery({
    queryKey: ["student-interviews", studentId],
    queryFn: () => loadStudentInterviews({ data: { studentId } }),
  });
  const [open, setOpen] = useState(null);
  return (
    <section className="surface p-4" aria-label="AI mock interviews">
      <SectionTitle sub="Practice interviews the student took, with any time they left the interview screen">
        AI mock interviews
      </SectionTitle>
      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !data ? (
        <PageSkeleton rows={1} />
      ) : !data.length ? (
        <EmptyState
          title="No AI interviews yet"
          hint="Finished interviews appear here with their score."
        />
      ) : (
        <ul className="divide-y rounded-xl border bg-card text-sm">
          {data.map((h) => (
            <li key={h.id}>
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <button
                  type="button"
                  aria-expanded={open === h.id}
                  className="min-w-0 flex-1 text-left"
                  onClick={() => setOpen(open === h.id ? null : h.id)}
                >
                  <span className="font-medium">{h.role}</span>{" "}
                  <span className="text-xs text-muted-foreground">
                    {h.difficulty} · {new Date(h.createdAt).toLocaleDateString()}
                  </span>
                </button>
                {h.violations > 0 && (
                  <StatusPill tone="warning">
                    Left the screen {h.violations} time{h.violations === 1 ? "" : "s"}
                  </StatusPill>
                )}
                {h.status === "terminated" ? (
                  <StatusPill tone="danger">Ended early</StatusPill>
                ) : (
                  <>
                    <span className="text-xs text-muted-foreground">{verdict(h.overall)}</span>
                    <span className="font-semibold tabular-nums">{h.overall}/100</span>
                  </>
                )}
              </div>
              {open === h.id && <InterviewDetail id={h.id} name={name} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
