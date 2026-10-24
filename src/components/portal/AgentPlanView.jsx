import { useEffect, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";

// The checklist of a plan, the "working" steps shown while an agent runs, and its trace.
const box = "rounded-lg border bg-muted/20 p-3";
const label = "text-xs font-semibold uppercase tracking-wide text-label";
const TYPE_TONE = {
  learn: "bg-info/15 text-info",
  practice: "bg-primary/10 text-primary",
  project: "bg-success/15 text-success",
  certification: "bg-warning/15 text-warning",
  interview: "bg-chart-3/15 text-chart-3",
  review: "bg-muted text-muted-foreground",
};

/** A short moving list of what the agent is doing while the (slow) run is in flight. */
export function Working({ steps }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setIndex((n) => Math.min(n + 1, steps.length - 1)), 4000);
    return () => clearInterval(timer);
  }, [steps.length]);
  return (
    <ol className={`${box} space-y-1 text-sm`} aria-live="polite">
      {steps.map((step, i) => (
        <li key={step} className={i > index ? "text-muted-foreground" : ""}>
          {i < index ? (
            <Check className="mr-2 inline size-4 text-success" />
          ) : i === index ? (
            <LoaderCircle className="mr-2 inline size-4 animate-spin text-primary" />
          ) : (
            <span className="mr-2 inline-block size-4" />
          )}
          {step}
        </li>
      ))}
    </ol>
  );
}

export function Plan({ run, canEdit, onToggle }) {
  const { plan } = run;
  const percent = run.progress.total
    ? Math.round((run.progress.done / run.progress.total) * 100)
    : 0;
  return (
    <div className="space-y-3">
      <p className="text-sm">{plan.summary}</p>
      {plan.changes?.length > 0 && (
        <div className={box}>
          <p className={label}>What changed since your last run</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm">
            {plan.changes.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Progress: {run.progress.done} of {run.progress.total} steps done
          </span>
          <span>{percent}%</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
        </div>
      </div>
      {plan.phases.map((phase) => (
        <section key={phase.id} className="rounded-lg border p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="font-semibold">{phase.title}</h4>
            {phase.weeks && <span className="text-xs text-muted-foreground">{phase.weeks}</span>}
          </div>
          {phase.goal && <p className="text-xs text-muted-foreground">{phase.goal}</p>}
          <ul className="mt-2 space-y-2">
            {phase.items.map((item) => (
              <li key={item.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-4 shrink-0 accent-[var(--primary)]"
                  checked={item.done}
                  disabled={!canEdit}
                  aria-label={item.text}
                  onChange={(event) => onToggle(item.id, event.target.checked)}
                />
                <span className={item.done ? "text-muted-foreground line-through" : ""}>
                  <span
                    className={`mr-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${TYPE_TONE[item.type] ?? TYPE_TONE.review}`}
                  >
                    {item.type}
                  </span>
                  {item.text}
                  {item.carried && (
                    <span className="ml-2 text-[11px] text-warning">carried over</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {plan.checkpoint && (
        <p className="text-xs text-muted-foreground">Next checkpoint: {plan.checkpoint}</p>
      )}
    </div>
  );
}

export function Trace({ run }) {
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer font-medium">
        How the agent worked · {run.model === "rules" ? "built-in builder" : run.model} ·{" "}
        {new Date(run.createdAt).toLocaleString()}
      </summary>
      <ul className="mt-1 list-inside list-disc space-y-0.5">
        {run.trace.map((entry, i) => (
          <li key={i}>
            <b>{entry.step}:</b> {entry.note}
          </li>
        ))}
      </ul>
    </details>
  );
}
