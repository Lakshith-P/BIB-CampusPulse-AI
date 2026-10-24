import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ExternalLink,
  Gauge,
  GraduationCap,
  LoaderCircle,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState, PageSkeleton, useAction } from "@/components/ui-kit";
import { Plan, Trace, Working } from "@/components/portal/AgentPlanView";
import { LearnedPredictions } from "@/components/portal/LearnedModels";
import { PRESET_ROLES } from "@/lib/career-tracks";
import {
  addExamScore,
  addTeacherRating,
  deleteExamScore,
  loadAgentPlans,
  loadPredictionInputs,
  loadStudentPrediction,
  runPredictionCoach,
  saveCodingProfile,
  setAgentPlanItem,
} from "@/lib/platform.functions";
import { PLACEMENT_WEIGHTS, RESULT_WEIGHTS } from "@/lib/prediction";

const card = "surface space-y-3 p-4";
const label = "text-xs font-semibold uppercase tracking-wide text-label";

const TONE = {
  "Placement-ready": "border-success/40 bg-success/10 text-success",
  Safe: "border-success/40 bg-success/10 text-success",
  Low: "border-success/40 bg-success/10 text-success",
  "On track": "border-info/40 bg-info/10 text-info",
  "Needs work": "border-warning/50 bg-warning/10 text-warning",
  Watch: "border-warning/50 bg-warning/10 text-warning",
  Medium: "border-warning/50 bg-warning/10 text-warning",
  "At risk": "border-destructive/50 bg-destructive/10 text-destructive",
  High: "border-destructive/50 bg-destructive/10 text-destructive",
};
const TONE_DEFAULT = "border-dashed text-muted-foreground";

export const Pill = ({ value, children }) => (
  <span
    className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${TONE[value] ?? TONE_DEFAULT}`}
  >
    {children ?? value}
  </span>
);

const PRIORITY = { high: "text-destructive", medium: "text-warning", low: "text-muted-foreground" };

function Bar({ value, tone = "bg-primary" }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full ${tone}`}
        style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }}
      />
    </div>
  );
}

const barTone = (v) =>
  v >= 75 ? "bg-success" : v >= 55 ? "bg-info" : v >= 40 ? "bg-warning" : "bg-destructive";

// ------------------------------------------------------------------ LeetCode entry

export function CodingForm({ studentId, coding }) {
  const qc = useQueryClient();
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["prediction"] }),
      qc.invalidateQueries({ queryKey: ["prediction-inputs"] }),
    ]);
  const { busy, run } = useAction(refresh);
  const [username, setUsername] = useState(coding?.leetcode_username ?? "");

  async function save(event) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const n = (name) => Number(f.get(name) || 0);
    await run(
      () =>
        saveCodingProfile({
          data: {
            ...(studentId ? { studentId } : {}),
            username: String(f.get("username") ?? "").trim(),
            easy: n("easy"),
            medium: n("medium"),
            hard: n("hard"),
            ...(f.get("rating") ? { contestRating: n("rating") } : {}),
          },
        }),
      "LeetCode progress saved.",
    );
  }

  const num = "w-24";
  return (
    <form
      onSubmit={save}
      className="space-y-2 rounded-lg border bg-muted/20 p-3"
      key={coding?.updated_at ?? "new"}
    >
      <p className={label}>LeetCode progress{coding?.source === "leetcode" ? " (synced)" : ""}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">
          Username
          <Input
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={60}
            className="w-40"
            disabled={busy}
          />
        </label>
        {[
          ["easy", "Easy"],
          ["medium", "Medium"],
          ["hard", "Hard"],
        ].map(([name, text]) => (
          <label key={name} className="text-xs">
            {text}
            <Input
              name={name}
              type="number"
              min="0"
              max="5000"
              defaultValue={coding?.[name] ?? 0}
              className={num}
              disabled={busy}
            />
          </label>
        ))}
        <label className="text-xs">
          Contest rating
          <Input
            name="rating"
            type="number"
            min="0"
            max="4500"
            defaultValue={coding?.contest_rating ?? ""}
            className={num}
            disabled={busy}
          />
        </label>
        <Button type="submit" size="sm" disabled={busy}>
          Save
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        A LeetCode account linked under Skills & Coding is used first; these numbers are the
        fallback. Solved problems count 1 point (easy), 3 (medium) and 6 (hard); a score of 100
        needs about 400 points.
      </p>
    </form>
  );
}

// ------------------------------------------------------------------ the two prediction cards

function PlacementCard({ placement, canEditCoding, coding }) {
  const weights = PLACEMENT_WEIGHTS;
  return (
    <section className={card} aria-label="Placement prediction">
      <p className={label}>
        <Gauge className="mr-1 inline size-3.5" /> Placement prediction
      </p>
      {placement.score === null ? (
        <p className="text-sm text-muted-foreground">
          Not enough data yet. Add LeetCode progress, aptitude scores, mock interviews and a resume.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <p className="font-display text-5xl font-bold leading-none">
              {placement.score}
              <span className="text-lg text-muted-foreground">/100</span>
            </p>
            <Pill value={placement.band} />
            <span className="text-xs text-muted-foreground">
              Confidence: {placement.confidence}
            </span>
          </div>
          <p className="text-sm">
            In {placement.horizonWeeks} weeks, if your recent trend continues:{" "}
            <b>{placement.projected}</b> <Pill value={placement.projectedBand} />
          </p>
        </>
      )}
      <ul className="space-y-2">
        {placement.components.map((c) => (
          <li key={c.key} className="text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span>
                <b>{c.label}</b>{" "}
                <span className="text-xs text-muted-foreground">weight {weights[c.key]}%</span>
              </span>
              <span className="tabular">{c.value === null ? "no data" : `${c.value}`}</span>
            </div>
            <Bar value={c.value} tone={c.value === null ? "bg-muted" : barTone(c.value)} />
            <p className="text-xs text-muted-foreground">
              {c.detail}
              {c.slope !== null && ` · trend ${c.slope > 0 ? "+" : ""}${c.slope}/week`}
            </p>
          </li>
        ))}
      </ul>
      {placement.improve?.length > 0 && (
        <div>
          <p className={label}>Sections to improve first</p>
          <ol className="mt-1 list-inside list-decimal space-y-0.5 text-sm">
            {placement.improve.slice(0, 3).map((i) => (
              <li key={i.key}>
                <b>{i.label}</b>: up to +{i.gain} points on your score
              </li>
            ))}
          </ol>
        </div>
      )}
      {canEditCoding && <CodingForm coding={coding} />}
    </section>
  );
}

function ResultCard({ result }) {
  return (
    <section className={card} aria-label="Result prediction">
      <p className={label}>
        <GraduationCap className="mr-1 inline size-3.5" /> Result prediction
      </p>
      {result.score === null ? (
        <p className="text-sm text-muted-foreground">
          Not enough data yet. A teacher needs to record mid-exam or continuous assessment scores.
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <p className="font-display text-5xl font-bold leading-none">
            {result.predictedSgpa ?? "—"}
            <span className="text-lg text-muted-foreground"> SGPA</span>
          </p>
          <span className="text-sm">
            about <b>{result.score}%</b> overall
          </span>
          <Pill value={result.band} />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Built from mid exams ({RESULT_WEIGHTS.mid}%), continuous assessments (
        {RESULT_WEIGHTS.continuous}%), attendance ({RESULT_WEIGHTS.attendance}%) and teacher rating
        ({RESULT_WEIGHTS.rating}%).
      </p>
      {result.subjects.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-2">Subject</th>
                <th className="px-1">Mid</th>
                <th className="px-1">CA</th>
                <th className="px-1">Att.</th>
                <th className="px-1">Rating</th>
                <th className="px-1">Predicted</th>
                <th className="pl-1">Outlook</th>
              </tr>
            </thead>
            <tbody>
              {result.subjects.map((s) => {
                const v = (k) => s.components.find((c) => c.key === k)?.value;
                const cell = (k) => (v(k) === null || v(k) === undefined ? "—" : Math.round(v(k)));
                return (
                  <tr key={s.subject} className="border-t align-top">
                    <td className="py-1.5 pr-2 font-medium">{s.subject}</td>
                    <td className="px-1 tabular">{cell("mid")}</td>
                    <td className="px-1 tabular">{cell("continuous")}</td>
                    <td
                      className={`px-1 tabular ${s.detentionRisk ? "font-semibold text-destructive" : ""}`}
                    >
                      {cell("attendance")}
                    </td>
                    <td className="px-1 tabular">{cell("rating")}</td>
                    <td className="px-1 font-semibold tabular">{s.predicted ?? "—"}</td>
                    <td className="pl-1">
                      <Pill value={s.outlook} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {result.detentionSubjects.length > 0 && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
          Attendance is below 75% in {result.detentionSubjects.join(", ")}: this can bar a student
          from the exam.
        </p>
      )}
    </section>
  );
}

function Actions({ actions }) {
  if (!actions.length) return null;
  return (
    <section className={card} aria-label="Recommended actions">
      <p className={label}>Recommended actions</p>
      <ul className="divide-y">
        {actions.slice(0, 6).map((a, i) => (
          <li key={i} className="py-2 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{a.title}</span>
              <span className={`text-xs font-semibold uppercase ${PRIORITY[a.priority]}`}>
                {a.priority}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {a.detail} Owner: {a.owner}.
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Predictions for one student, for the student themselves or a teacher or administrator. */
export function PredictionPanel({ studentId, show = "both", withActions = true }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["prediction", studentId ?? "me"],
    queryFn: () => loadStudentPrediction({ data: studentId ? { studentId } : {} }),
  });
  const inputs = useQuery({
    queryKey: ["prediction-inputs", studentId ?? "me", "coding"],
    queryFn: () => loadPredictionInputs({ data: studentId ? { studentId } : {} }),
    enabled: Boolean(data?.canEditCoding),
  });
  if (isLoading) return <PageSkeleton rows={2} />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const both = show === "both";
  return (
    <div className="space-y-4">
      <div
        className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${TONE[data.risk.level] ?? TONE_DEFAULT}`}
      >
        <b>Risk level: {data.risk.level}</b>
        <span className="text-sm">{data.risk.reasons.slice(0, 2).join(" ")}</span>
      </div>
      <div className={`grid gap-4 ${both ? "lg:grid-cols-2" : ""}`}>
        {(both || show === "placement") && (
          <PlacementCard
            placement={data.placement}
            canEditCoding={data.canEditCoding}
            coding={inputs.data?.coding}
          />
        )}
        {(both || show === "result") && <ResultCard result={data.result} />}
      </div>
      <LearnedPredictions studentId={studentId} show={show} />
      {withActions && (
        <Actions actions={data.actions.filter((a) => show === "both" || a.area === show)} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ teacher entry

const today = () => new Date().toISOString().slice(0, 10);

/** Where teachers record mid exams, continuous assessments, ratings and (if needed) LeetCode progress. */
export function PredictionInputsEditor({ studentId }) {
  const qc = useQueryClient();
  const key = ["prediction-inputs", studentId, "all"];
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: key,
    queryFn: () => loadPredictionInputs({ data: { studentId } }),
  });
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["prediction", studentId] }),
      qc.invalidateQueries({ queryKey: ["prediction-inputs", studentId] }),
    ]);
  const { busy, run } = useAction(refresh);
  if (isLoading) return <PageSkeleton rows={1} />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const field = "mt-1 block w-full rounded-md border bg-background px-2 py-1.5 text-sm";
  async function addScore(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const f = new FormData(form);
    const result = await run(
      () =>
        addExamScore({
          data: {
            studentId,
            subject: String(f.get("subject")),
            kind: String(f.get("kind")),
            title: String(f.get("title") ?? ""),
            score: Number(f.get("score")),
            max: Number(f.get("max")),
            takenOn: String(f.get("date")),
          },
        }),
      "Score recorded.",
    );
    if (result.ok) form.reset();
  }
  async function addRating(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const f = new FormData(form);
    const result = await run(
      () =>
        addTeacherRating({
          data: {
            studentId,
            subject: String(f.get("subject") ?? ""),
            rating: Number(f.get("rating")),
            comment: String(f.get("comment") ?? ""),
          },
        }),
      "Rating saved.",
    );
    if (result.ok) form.reset();
  }

  return (
    <section className={card} aria-label="Prediction inputs">
      <p className={label}>Inputs behind the predictions</p>
      <form onSubmit={addScore} className="grid items-end gap-2 sm:grid-cols-6">
        <label className="text-xs sm:col-span-2">
          Subject
          <select name="subject" className={field} required disabled={busy}>
            {data.subjects.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Type
          <select name="kind" className={field} disabled={busy}>
            <option value="mid1">Mid exam 1</option>
            <option value="mid2">Mid exam 2</option>
            <option value="continuous">Continuous assessment</option>
          </select>
        </label>
        <label className="text-xs">
          Score
          <Input name="score" type="number" step="0.5" min="0" required disabled={busy} />
        </label>
        <label className="text-xs">
          Out of
          <Input name="max" type="number" min="1" defaultValue={50} required disabled={busy} />
        </label>
        <label className="text-xs">
          Date
          <Input name="date" type="date" defaultValue={today()} required disabled={busy} />
        </label>
        <label className="text-xs sm:col-span-5">
          Title (optional, e.g. Quiz 2)
          <Input name="title" maxLength={80} disabled={busy} />
        </label>
        <Button type="submit" size="sm" disabled={busy || !data.subjects.length}>
          Add score
        </Button>
      </form>
      <form onSubmit={addRating} className="grid items-end gap-2 sm:grid-cols-6">
        <label className="text-xs sm:col-span-2">
          Rating for
          <select name="subject" className={field} disabled={busy}>
            <option value="">Overall</option>
            {data.subjects.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Rating
          <select name="rating" className={field} disabled={busy}>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n} / 5
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs sm:col-span-2">
          Comment (optional)
          <Input name="comment" maxLength={500} disabled={busy} />
        </label>
        <Button type="submit" size="sm" disabled={busy}>
          Save rating
        </Button>
      </form>
      <CodingForm studentId={studentId} coding={data.coding} />
      {data.exams.length > 0 && (
        <ul className="divide-y text-sm">
          {data.exams.slice(0, 12).map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 py-1.5">
              <span>
                <b>{e.subject}</b> ·{" "}
                {e.kind === "continuous"
                  ? e.title || "Continuous"
                  : e.kind === "mid1"
                    ? "Mid 1"
                    : "Mid 2"}
                : {e.score}/{e.max}{" "}
                <span className="text-xs text-muted-foreground">{e.taken_on}</span>
              </span>
              <button
                type="button"
                aria-label="Delete score"
                disabled={busy}
                onClick={() => run(() => deleteExamScore({ data: { id: e.id } }), "Score removed.")}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {data.ratings.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Ratings:{" "}
          {data.ratings
            .slice(0, 6)
            .map((r) => `${r.subject || "Overall"} ${r.rating}/5`)
            .join(" · ")}
        </p>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ student coach

/** The student's agent: market-aware ranking of what to improve, with a plan that tracks progress. */
export function PredictionCoach() {
  const [role, setRole] = useState("");
  const qc = useQueryClient();
  const queryKey = ["agent-plans", "me", "coach"];
  const query = useQuery({ queryKey, queryFn: () => loadAgentPlans({ data: {} }) });
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey }),
      qc.invalidateQueries({ queryKey: ["prediction"] }),
    ]);
  const { busy, run } = useAction(refresh);
  const last = query.data?.prediction;
  const start = (name) => {
    const target = (name ?? role).trim();
    if (target.length >= 3)
      void run(
        () => runPredictionCoach({ data: { role: target } }),
        "Your improvement plan is ready.",
      );
  };

  return (
    <section className={card} aria-label="Prediction coach">
      <div>
        <p className={label}>
          <Sparkles className="mr-1 inline size-3.5" /> Prediction coach
        </p>
        <p className="text-xs text-muted-foreground">
          Choose the role you want. The agent re-checks your predictions, reads what the market asks
          of that role, ranks which of your five placement criteria to improve first, and alerts
          your teacher if you are at high risk.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[...new Set([last?.plan.role, ...PRESET_ROLES].filter(Boolean))].map((name) => (
          <Button
            key={name}
            type="button"
            size="sm"
            variant={last?.plan.role === name ? "default" : "outline"}
            disabled={busy}
            onClick={() => start(name)}
          >
            {name}
          </Button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start();
        }}
      >
        <Input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          maxLength={80}
          placeholder="Or type any role"
          aria-label="Target role"
          disabled={busy}
        />
        <Button type="submit" disabled={busy || role.trim().length < 3}>
          {busy ? (
            <LoaderCircle className="mr-1 size-4 animate-spin" />
          ) : (
            <ArrowRight className="mr-1 size-4" />
          )}{" "}
          Run coach
        </Button>
      </form>
      {busy && (
        <Working
          steps={[
            "Re-calculating your placement and result predictions",
            "Reading what the market asks of this role",
            "Ranking the criteria by how much they would raise your score",
            "Writing your plan and alerting your teacher if you are at high risk",
          ]}
        />
      )}
      {query.error && <ErrorState error={query.error} onRetry={query.refetch} />}
      {!busy && last && (
        <div className="space-y-3">
          <h3 className="font-semibold">Improvement plan for {last.plan.role}</h3>
          <p className="text-xs text-muted-foreground">
            Market view:{" "}
            {last.model === "rules"
              ? "general hiring priors (no live market reading)"
              : `read by ${last.model} from ${last.sources.length} live source(s)`}
          </p>
          {last.plan.trends.length > 0 && (
            <ul className="list-inside list-disc space-y-0.5 text-sm">
              {last.plan.trends.map((t, i) => (
                <li key={i}>
                  {t.note}{" "}
                  {t.sourceId && (
                    <span className="text-xs text-muted-foreground">[{t.sourceId}]</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 pr-2">Section to improve</th>
                  <th className="px-1">Now</th>
                  <th className="px-1">Possible gain</th>
                  <th className="px-1">Market importance</th>
                  <th className="pl-1">Priority</th>
                </tr>
              </thead>
              <tbody>
                {last.plan.sections.map((s) => (
                  <tr key={s.key} className="border-t">
                    <td className="py-1.5 pr-2 font-medium">{s.label}</td>
                    <td className="px-1 tabular">{s.value ?? "no data"}</td>
                    <td className="px-1 tabular">+{s.gain}</td>
                    <td className="px-1 tabular">{s.importance}/5</td>
                    <td className="pl-1 font-semibold tabular">{s.priority}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Plan
            run={last}
            canEdit
            onToggle={(itemId, done) =>
              run(() => setAgentPlanItem({ data: { planId: last.id, itemId, done } }))
            }
          />
          {last.sources.length > 0 && (
            <ul className="space-y-0.5 text-sm">
              {last.sources.map((s) => (
                <li key={s.id}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                  >
                    {s.id} · {s.title} <ExternalLink className="size-3" />
                  </a>
                </li>
              ))}
            </ul>
          )}
          <Trace run={last} />
        </div>
      )}
      {!busy && !last && !query.isLoading && (
        <p className="text-sm text-muted-foreground">No plan yet. Choose a role above to start.</p>
      )}
    </section>
  );
}
