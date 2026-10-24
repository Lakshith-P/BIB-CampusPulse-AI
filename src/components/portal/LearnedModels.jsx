import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Brain, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState, PageSkeleton, useAction } from "@/components/ui-kit";
import { loadLearnedPredictions, loadModelReport, trainModels } from "@/lib/platform.functions";
import { useCampus } from "@/lib/use-campus";

const card = "surface space-y-3 p-4";
const label = "text-xs font-semibold uppercase tracking-wide text-label";

const pc = (v) => (v === null || v === undefined ? "n/a" : `${Math.round(v * 100)}%`);
const f2 = (v) => (v === null || v === undefined ? "n/a" : v.toFixed(2));

/** Accuracy, precision, recall and F1 of one decision, measured on students the model never saw. */
function DecisionTable({ decisions }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="py-1 pr-2">Decision</th>
            <th className="px-1">Accuracy</th>
            <th className="px-1">Precision</th>
            <th className="px-1">Recall</th>
            <th className="px-1">F1</th>
            <th className="pl-1">Tested on</th>
          </tr>
        </thead>
        <tbody>
          {decisions.map((d) => (
            <tr key={d.name} className="border-t">
              <td className="py-1.5 pr-2">
                <b>{d.name}</b>
                <p className="text-xs text-muted-foreground">{d.label}</p>
              </td>
              <td className="px-1 tabular">{pc(d.accuracy)}</td>
              <td className="px-1 tabular">{pc(d.precision)}</td>
              <td className="px-1 tabular">{pc(d.recall)}</td>
              <td className="px-1 font-semibold tabular">{f2(d.f1)}</td>
              <td className="pl-1 text-xs text-muted-foreground">
                {d.n} predictions
                <br />
                {d.support} actually positive
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const confidenceText = (p) => (p === null ? "" : `${Math.round(p * 100)}% confident`);

function Gains({ items }) {
  if (!items?.length) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-xs">
      {items.map((g) => (
        <li key={g.label}>
          <span className="font-semibold text-success">+{g.gain}</span> predicted: {g.label}
        </li>
      ))}
    </ul>
  );
}

function Reliability({ r }) {
  const head = r.decisions.find((d) => d.name === r.headline) ?? r.decisions[0];
  return (
    <p className="text-xs text-muted-foreground">
      Trained on {r.rows} records. Typical error {r.mae} (R² {r.r2}). For the "{head.name}" decision
      the model is {pc(head.accuracy)} accurate with F1 {f2(head.f1)} (precision{" "}
      {pc(head.precision)}, recall {pc(head.recall)}).
    </p>
  );
}

/** Predictions from the trained regression models for one student, with confidence and what to change. */
export function LearnedPredictions({ studentId, show = "both" }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["learned", studentId ?? "me"],
    queryFn: () => loadLearnedPredictions({ data: studentId ? { studentId } : {} }),
  });
  if (isLoading) return <PageSkeleton rows={1} />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const wantResult = show === "both" || show === "result";
  const wantPlacement = show === "both" || show === "placement";

  return (
    <section className={card} aria-label="Learned model predictions">
      <p className={label}>
        <Brain className="mr-1 inline size-3.5" /> Linear-regression model, trained on this
        platform's data
      </p>
      {!data.trained && (
        <p className="text-sm text-muted-foreground">
          The models have not been trained yet. An administrator can train them from the Predictions
          page.
        </p>
      )}
      {wantResult && data.result && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Expected final marks per subject</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 pr-2">Subject</th>
                  <th className="px-1">Predicted</th>
                  <th className="px-1">90% range</th>
                  <th className="px-1">Confidence</th>
                  <th className="pl-1">Biggest lever</th>
                </tr>
              </thead>
              <tbody>
                {data.result.subjects.map((s) => (
                  <tr key={s.subject} className="border-t align-top">
                    <td className="py-1.5 pr-2 font-medium">{s.subject}</td>
                    <td className="px-1 font-semibold tabular">{s.value}</td>
                    <td className="px-1 tabular text-muted-foreground">
                      {Math.round(s.interval.low)}–{Math.round(s.interval.high)}
                    </td>
                    <td className="px-1 text-xs">
                      {confidenceText(s.headline.confidence)} the marks will be{" "}
                      {s.headline.flagged ? "below" : "above"} the pass mark
                    </td>
                    <td className="pl-1 text-xs">
                      {s.improve[0] ? (
                        <>
                          <b className="text-success">+{s.improve[0].gain}</b> if you:{" "}
                          {s.improve[0].label}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer font-medium">
              What would improve each subject
            </summary>
            <div className="mt-1 space-y-2">
              {data.result.subjects.map((s) => (
                <div key={s.subject}>
                  <b>{s.subject}</b>
                  <Gains items={s.improve} />
                </div>
              ))}
            </div>
          </details>
          <Reliability r={data.result.reliability} />
          <DecisionTable decisions={data.result.reliability.decisions} />
        </div>
      )}
      {wantResult && data.nextSgpa && (
        <div className="space-y-1 border-t pt-3">
          <p className="text-sm font-semibold">Next semester</p>
          <p className="text-sm">
            Expected SGPA <b>{data.nextSgpa.value}</b> (90% range{" "}
            {data.nextSgpa.interval.low.toFixed(1)}–{data.nextSgpa.interval.high.toFixed(1)}), which
            is {data.nextSgpa.improves ? "higher than" : "no higher than"} your last SGPA of{" "}
            {data.nextSgpa.last}. {confidenceText(data.nextSgpa.headline.confidence)} it will be{" "}
            {data.nextSgpa.headline.flagged ? "below" : "at or above"} 6.0.
          </p>
          <Reliability r={data.nextSgpa.reliability} />
        </div>
      )}
      {wantPlacement && data.interview && (
        <div className="space-y-1 border-t pt-3">
          <p className="text-sm font-semibold">Expected mock-interview score</p>
          <p className="text-sm">
            <b>{data.interview.value}</b> out of 100 (90% range{" "}
            {Math.round(data.interview.interval.low)}–{Math.round(data.interview.interval.high)}).{" "}
            {confidenceText(data.interview.headline.confidence)} you will be{" "}
            {data.interview.headline.flagged ? "below" : "at or above"} the readiness line of 60.
          </p>
          <p className="text-xs font-medium">What would raise it most:</p>
          <Gains items={data.interview.improve} />
          <Reliability r={data.interview.reliability} />
        </div>
      )}
      {data.trained && !data.result && !data.nextSgpa && !data.interview && (
        <p className="text-sm text-muted-foreground">
          There is not enough recorded data for this student yet (mid exams, continuous assessments,
          semester grades, LeetCode progress and mock interviews feed these models).
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        These are statistical estimates learned from past records. They show what moves with what,
        not a guarantee that a change will cause the result.
      </p>
    </section>
  );
}

/** How good each model is, how it compares with simple baselines, and a retrain button for administrators. */
export function ModelReport() {
  const { role } = useCampus();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["model-report"],
    queryFn: () => loadModelReport(),
  });
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["model-report"] }),
      qc.invalidateQueries({ queryKey: ["learned"] }),
    ]);
  const { busy, run } = useAction(refresh);
  if (isLoading) return <PageSkeleton rows={2} />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <section className={card} aria-label="Model performance">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={label}>
            <Brain className="mr-1 inline size-3.5" /> Prediction models: accuracy and F1
          </p>
          <p className="max-w-2xl text-xs text-muted-foreground">
            Linear regression trained on this platform's records and tested on students it had never
            seen (5-fold cross-validation grouped by student). Because a regression predicts a
            number, accuracy, precision, recall and F1 are measured on the decisions made from that
            number.
          </p>
        </div>
        {role === "admin" && (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => run(() => trainModels(), "Models retrained from the latest data.")}
          >
            <RefreshCw className={`mr-1 size-4 ${busy ? "animate-spin" : ""}`} />
            {busy ? "Training…" : "Retrain from live data"}
          </Button>
        )}
      </div>
      {data.map((m) => (
        <div key={m.key} className="space-y-2 rounded-lg border p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-semibold">
              {m.label}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                predicts {m.outcome.toLowerCase()}
              </span>
            </p>
            {m.trained && (
              <span className="text-xs text-muted-foreground">
                {m.rows} records · trained {new Date(m.trainedAt).toLocaleString()}
              </span>
            )}
          </div>
          {!m.trained ? (
            <p className="text-sm text-muted-foreground">Not trained yet.</p>
          ) : (
            <>
              <p className="text-sm">
                Typical error <b>{m.metrics.mae}</b> {m.unit} (RMSE {m.metrics.rmse}, R²{" "}
                {m.metrics.r2}).{" "}
                {Object.entries(m.metrics.baselines).map(([name, b]) => (
                  <span key={name} className="text-muted-foreground">
                    {name}: error {b.mae}.{" "}
                  </span>
                ))}
              </p>
              <DecisionTable decisions={m.metrics.decisions} />
              <p className="text-xs text-muted-foreground">
                What it learned:{" "}
                {m.metrics.effects
                  .map((e) => `${e.feature} ${e.perUnit >= 0 ? "+" : ""}${e.perUnit} per point`)
                  .join(" · ")}
              </p>
            </>
          )}
        </div>
      ))}
    </section>
  );
}
