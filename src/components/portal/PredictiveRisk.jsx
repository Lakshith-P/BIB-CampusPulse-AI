import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  CircleCheck,
  Gauge,
  GraduationCap,
  Lightbulb,
  Printer,
  RefreshCw,
  ShieldAlert,
  Target,
} from "lucide-react";
import { PageSkeleton, ErrorState, useAction } from "@/components/ui-kit";
import { PredictionCoach } from "@/components/portal/PredictionPanel";
import { useCampus } from "@/lib/use-campus";
import {
  loadLearnedPredictions,
  loadPredictionInputs,
  loadStudentPrediction,
  saveCodingProfile,
} from "@/lib/platform.functions";
import { liveNotifications } from "@/lib/live-profile";
import { academicRisk, placementRisk } from "@/lib/risk-flags";
import { successScore } from "@/lib/scoring";
import { PLACEMENT_WEIGHTS, RESULT_WEIGHTS } from "@/lib/prediction";
import { DEFAULT_WEIGHTS } from "@/lib/types";
import { cn } from "@/lib/utils";

// The student's "Predictive Risk & AI" page: attention list, placement and result predictions,
// the learned models, the recommended actions, the role coach, the rule-based risk flags and the
// make-up of the Success Score. Every figure comes from the same server data as before; only the
// layout is new, and a section with nothing recorded says so instead of showing a made-up number.

const CARD = "rounded-xl border border-[#D9E1EC] bg-white shadow-xs";
const EYEBROW = "text-[11px] font-bold uppercase tracking-wider text-[#00338D]";
const NAVY = "#00205f";
const C = { ok: "#16865B", warn: "#D99216", risk: "#C83C4A", blue: "#0066CC", cyan: "#00B8F5" };

const TONE = {
  "Placement-ready": "bg-emerald-50 text-[#16865B] border-emerald-200",
  Safe: "bg-emerald-50 text-[#16865B] border-emerald-200",
  Low: "bg-emerald-50 text-[#16865B] border-emerald-200",
  "On track": "bg-[#eef4ff] text-[#00338D] border-blue-200",
  "Needs work": "bg-amber-50 text-[#B87A0E] border-amber-200",
  Watch: "bg-amber-50 text-[#B87A0E] border-amber-200",
  Medium: "bg-amber-50 text-[#B87A0E] border-amber-200",
  "At risk": "bg-red-50 text-[#C83C4A] border-red-200",
  High: "bg-red-50 text-[#C83C4A] border-red-200",
};
function Pill({ value, children }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-[11px] font-semibold",
        TONE[value] ?? "border-slate-200 bg-slate-50 text-slate-500",
      )}
    >
      {children ?? value}
    </span>
  );
}

const barColor = (v) => (v >= 75 ? C.ok : v >= 55 ? C.blue : v >= 40 ? C.warn : C.risk);
function Meter({ value, color }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full transition-[width] duration-700"
        style={{
          width: `${Math.max(0, Math.min(100, value ?? 0))}%`,
          background: `linear-gradient(90deg, ${color ?? NAVY}, ${C.blue})`,
        }}
      />
    </div>
  );
}

function CardTitle({ icon: Icon, children, right }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#00205f]">
        <Icon className="size-4 text-[#0066CC]" />
        {children}
      </h2>
      {right}
    </div>
  );
}

// ---------------------------------------------------------------- attention
function Attention({ s, today }) {
  const alerts = liveNotifications(s, today).filter((n) => n.tone !== "info");
  return (
    <section className={`${CARD} p-5`} aria-label="Needs your attention">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="grid size-8 place-items-center rounded-md bg-[#eef4ff] text-[#00338D]">
          <AlertTriangle className="size-4" />
        </span>
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#00205f]">
            Needs your immediate attention
          </h2>
          <p className="text-xs text-slate-500">
            {alerts.length
              ? `${alerts.length} item${alerts.length === 1 ? "" : "s"} that can affect your marks, attendance or placement chances.`
              : "Nothing is flagged right now."}
          </p>
        </div>
      </div>
      {alerts.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-[#16865B]">
          <CircleCheck className="size-4" /> You are on track everywhere. Alerts appear here as soon
          as your marks, attendance or deadlines need action.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {alerts.map((n, i) => {
            const danger = n.tone === "danger";
            return (
              <div
                key={i}
                className="rounded-lg border bg-[#f8f9ff] p-3.5"
                style={{
                  borderColor: danger ? "#f2c4c9" : "#D9E1EC",
                  borderLeft: `3px solid ${danger ? C.risk : C.warn}`,
                }}
              >
                <p
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: danger ? C.risk : "#B87A0E" }}
                >
                  {n.area}
                </p>
                <p className="mt-1 text-sm leading-snug text-[#151c25]">{n.text}</p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- LeetCode sync
function LeetcodeForm({ coding }) {
  const qc = useQueryClient();
  const { busy, run } = useAction(() =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["prediction"] }),
      qc.invalidateQueries({ queryKey: ["prediction-inputs"] }),
      qc.invalidateQueries({ queryKey: ["learned"] }),
    ]),
  );
  const [username, setUsername] = useState(coding?.leetcode_username ?? "");
  const field =
    "w-full rounded-md border border-[#D9E1EC] bg-white px-2.5 py-1.5 text-sm outline-none focus:border-[#0066CC] focus:ring-2 focus:ring-[#0066CC]/20 disabled:opacity-60";
  return (
    <form
      key={coding?.updated_at ?? "new"}
      className="mt-5 border-t border-[#D9E1EC] pt-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const n = (name) => Number(f.get(name) || 0);
        await run(
          () =>
            saveCodingProfile({
              data: {
                username: String(f.get("username") ?? "").trim(),
                easy: n("easy"),
                medium: n("medium"),
                hard: n("hard"),
                ...(f.get("rating") ? { contestRating: n("rating") } : {}),
              },
            }),
          "LeetCode progress saved.",
        );
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <p className={EYEBROW}>
          LeetCode progress{coding?.source === "leetcode" ? " (synced)" : ""}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        <label className="col-span-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:col-span-2">
          Username
          <input
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={60}
            disabled={busy}
            className={cn(field, "mt-1 normal-case")}
          />
        </label>
        {[
          ["easy", "Easy"],
          ["medium", "Medium"],
          ["hard", "Hard"],
        ].map(([name, text]) => (
          <label
            key={name}
            className="text-[11px] font-semibold uppercase tracking-wide text-slate-500"
          >
            {text}
            <input
              name={name}
              type="number"
              min="0"
              max="5000"
              defaultValue={coding?.[name] ?? 0}
              disabled={busy}
              className={cn(field, "mt-1")}
            />
          </label>
        ))}
        <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Contest rating
          <input
            name="rating"
            type="number"
            min="0"
            max="4500"
            defaultValue={coding?.contest_rating ?? ""}
            disabled={busy}
            className={cn(field, "mt-1")}
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-[#00338D] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#00205f] disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        A LeetCode account linked under Skills &amp; Coding is used first; these numbers are the
        fallback. Easy counts 1 point, medium 3, hard 6; a score of 100 needs about 400 points.
      </p>
    </form>
  );
}

// ---------------------------------------------------------------- placement + result
function PlacementCard({ placement, coding, canEditCoding }) {
  const top = placement.improve?.[0];
  return (
    <section className={`${CARD} p-5`} aria-label="Placement prediction">
      <CardTitle
        icon={Gauge}
        right={
          placement.score !== null && (
            <span className="flex items-center gap-2">
              <Pill value={placement.band} />
              <span className="text-xs text-slate-500">Confidence: {placement.confidence}</span>
            </span>
          )
        }
      >
        Placement prediction
      </CardTitle>
      {placement.score === null ? (
        <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          Not enough data yet. Add LeetCode progress, aptitude scores, mock interviews and a resume
          and your prediction appears here.
        </p>
      ) : (
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="cp-num text-[3rem] font-bold leading-none text-[#00205f]">
              {placement.score}
              <span className="text-lg font-medium text-slate-400"> / 100</span>
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              In {placement.horizonWeeks} weeks, if your recent trend continues:{" "}
              <b className="text-[#00205f]">{placement.projected}</b>
              <Pill value={placement.projectedBand} />
            </p>
          </div>
          {top && (
            <div className="rounded-lg border border-[#D9E1EC] bg-[#f8f9ff] px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Impact potential
              </p>
              <p className="text-lg font-bold text-[#0066CC]">+{top.gain} pts</p>
              <p className="text-xs text-slate-500">max with {top.label}</p>
            </div>
          )}
        </div>
      )}
      <ul className="mt-5 space-y-4">
        {placement.components.map((c) => (
          <li key={c.key}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-[#151c25]">
                {c.label}{" "}
                <span className="text-xs font-normal text-slate-400">
                  (weight {PLACEMENT_WEIGHTS[c.key]}%)
                </span>
              </span>
              <span className="font-bold tabular-nums text-[#00205f]">
                {c.value === null ? "no data" : c.value}
              </span>
            </div>
            <Meter value={c.value} color={c.value === null ? "#cbd5e1" : barColor(c.value)} />
            <p className="mt-1 text-xs text-slate-500">
              {c.detail}
              {c.slope !== null && ` · trend ${c.slope > 0 ? "+" : ""}${c.slope}/week`}
            </p>
          </li>
        ))}
      </ul>
      {placement.improve?.length > 0 && (
        <div className="mt-5 rounded-lg border border-blue-100 bg-[#eef4ff] p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#00338D]">
            Sections to improve first
          </p>
          <ol className="mt-1.5 list-inside list-decimal space-y-1 text-sm text-[#151c25]">
            {placement.improve.slice(0, 3).map((i) => (
              <li key={i.key}>
                <b>{i.label}</b>: up to <b className="text-[#0066CC]">+{i.gain} points</b> on your
                score
              </li>
            ))}
          </ol>
        </div>
      )}
      {canEditCoding && <LeetcodeForm coding={coding} />}
    </section>
  );
}

function ResultCard({ result }) {
  const danger = result.subjects.filter((s) => s.outlook === "At risk").length;
  return (
    <section className={`${CARD} flex flex-col p-5`} aria-label="Result prediction">
      <CardTitle icon={GraduationCap} right={result.score !== null && <Pill value={result.band} />}>
        Result prediction
      </CardTitle>
      {result.score === null ? (
        <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          Not enough data yet. Your teacher needs to record mid-exam or continuous assessment
          scores.
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <p className="cp-num text-[3rem] font-bold leading-none text-[#00205f]">
            {result.predictedSgpa ?? "—"}
            <span className="text-lg font-medium text-slate-400"> SGPA</span>
          </p>
          <span className="pb-1 text-sm text-slate-600">
            about <b className="text-[#00205f]">{result.score}%</b> overall
          </span>
        </div>
      )}
      <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Formula: mid exams ({RESULT_WEIGHTS.mid}%), continuous assessments (
        {RESULT_WEIGHTS.continuous}%), attendance ({RESULT_WEIGHTS.attendance}%), teacher rating (
        {RESULT_WEIGHTS.rating}%).
      </p>
      {result.subjects.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#D9E1EC] text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-2">Subject</th>
                <th className="px-1.5 text-right">Mid</th>
                <th className="px-1.5 text-right">CA</th>
                <th className="px-1.5 text-right">Att.</th>
                <th className="px-1.5 text-right">Rating</th>
                <th className="px-1.5 text-right">Predicted</th>
                <th className="pl-2">Outlook</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.subjects.map((s) => {
                const v = (k) => s.components.find((c) => c.key === k)?.value;
                const cell = (k) => (v(k) === null || v(k) === undefined ? "—" : Math.round(v(k)));
                return (
                  <tr key={s.subject}>
                    <td className="py-2 pr-2 font-medium text-[#151c25]">{s.subject}</td>
                    <td className="px-1.5 text-right tabular-nums">{cell("mid")}</td>
                    <td className="px-1.5 text-right tabular-nums">{cell("continuous")}</td>
                    <td
                      className={cn(
                        "px-1.5 text-right tabular-nums",
                        s.detentionRisk && "font-bold text-[#C83C4A]",
                      )}
                    >
                      {cell("attendance")}
                    </td>
                    <td className="px-1.5 text-right tabular-nums">{cell("rating")}</td>
                    <td className="px-1.5 text-right font-bold tabular-nums text-[#0066CC]">
                      {s.predicted ?? "—"}
                    </td>
                    <td className="pl-2">
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
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-[#C83C4A]">
          Attendance is below 75% in {result.detentionSubjects.join(", ")}: this can bar a student
          from the exam.
        </p>
      )}
      <div className="mt-auto flex flex-wrap justify-between gap-2 border-t border-[#D9E1EC] pt-3 text-xs text-slate-500">
        <span>Pass mark: 40 across papers</span>
        <b className={danger ? "text-[#C83C4A]" : "text-[#16865B]"}>
          {danger} subject{danger === 1 ? "" : "s"} in the danger zone
        </b>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- learned models
const pct = (v) => (v === null || v === undefined ? "n/a" : `${Math.round(v * 100)}%`);
const f2 = (v) => (v === null || v === undefined ? "n/a" : v.toFixed(2));
const confidence = (p) => (p === null ? "" : `${Math.round(p * 100)}% confident`);

function Models() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["learned", "me"],
    queryFn: () => loadLearnedPredictions({ data: {} }),
  });
  if (isLoading) return <PageSkeleton rows={2} />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const rel = data.result?.reliability;
  return (
    <section className={`${CARD} p-5`} aria-label="Learned model predictions">
      <CardTitle
        icon={Brain}
        right={
          rel && (
            <span className="rounded border border-[#D9E1EC] bg-slate-50 px-2.5 py-1 font-mono text-[11px] text-slate-600">
              Trained on {rel.rows} records · typical error {rel.mae} · R² {rel.r2}
            </span>
          )
        }
      >
        Linear-regression model, trained on this platform's data
      </CardTitle>
      {!data.trained && (
        <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          The models have not been trained yet. An administrator can train them from the Predictions
          page; your forecasts appear here afterwards.
        </p>
      )}
      {data.trained && !data.result && !data.nextSgpa && !data.interview && (
        <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          There is not enough recorded data for you yet. Mid exams, continuous assessments, semester
          grades, LeetCode progress and mock interviews feed these models.
        </p>
      )}
      {data.result && (
        <>
          <p className={cn(EYEBROW, "mb-2")}>
            Expected final marks per subject &amp; biggest single lever
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#D9E1EC] text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-2 pr-2">Subject</th>
                  <th className="px-2 text-right">Predicted</th>
                  <th className="px-2">90% range</th>
                  <th className="px-2">Confidence</th>
                  <th className="pl-2 text-right">Biggest available lever</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.result.subjects.map((s) => (
                  <tr key={s.subject}>
                    <td className="py-2.5 pr-2 font-medium text-[#151c25]">{s.subject}</td>
                    <td className="px-2 text-right font-bold tabular-nums text-[#0066CC]">
                      {s.value}
                    </td>
                    <td className="px-2 tabular-nums text-slate-500">
                      {Math.round(s.interval.low)} – {Math.round(s.interval.high)}
                    </td>
                    <td className="px-2 text-xs text-slate-600">
                      {confidence(s.headline.confidence)} marks will be{" "}
                      {s.headline.flagged ? "below" : "above"} the pass mark
                    </td>
                    <td className="pl-2 text-right text-xs text-slate-600">
                      {s.improve[0] ? (
                        <>
                          <b className="mr-1 rounded bg-[#eef4ff] px-1.5 py-0.5 text-[#00338D]">
                            +{s.improve[0].gain}
                          </b>
                          if you: {s.improve[0].label}
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
          <p className={cn(EYEBROW, "mb-2 mt-6")}>
            Model decision benchmarks (tested on students the model never saw)
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#D9E1EC] text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-2 pr-2">Decision</th>
                  <th className="px-2 text-right">Accuracy</th>
                  <th className="px-2 text-right">Precision</th>
                  <th className="px-2 text-right">Recall</th>
                  <th className="px-2 text-right">F1</th>
                  <th className="pl-2">Tested on</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rel.decisions.map((d) => (
                  <tr key={d.name}>
                    <td className="py-2.5 pr-2">
                      <b className="text-[#151c25]">{d.name}</b>
                      <p className="text-xs text-slate-500">{d.label}</p>
                    </td>
                    <td className="px-2 text-right tabular-nums">{pct(d.accuracy)}</td>
                    <td className="px-2 text-right tabular-nums">{pct(d.precision)}</td>
                    <td className="px-2 text-right tabular-nums">{pct(d.recall)}</td>
                    <td className="px-2 text-right font-bold tabular-nums text-[#00205f]">
                      {f2(d.f1)}
                    </td>
                    <td className="pl-2 text-xs text-slate-500">
                      {d.n} predictions · {d.support} actually positive
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {(data.nextSgpa || data.interview) && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {data.nextSgpa && (
            <div className="rounded-xl border border-[#D9E1EC] bg-[#f8f9ff] p-4">
              <p className={EYEBROW}>Next semester forecast</p>
              <p className="cp-num mt-1 text-3xl font-bold text-[#00205f]">
                {data.nextSgpa.value}{" "}
                <span className="text-xs font-medium text-slate-500">
                  SGPA (90% range {data.nextSgpa.interval.low.toFixed(1)} –{" "}
                  {data.nextSgpa.interval.high.toFixed(1)})
                </span>
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {data.nextSgpa.improves ? "Higher than" : "No higher than"} your last SGPA of{" "}
                {data.nextSgpa.last}. {confidence(data.nextSgpa.headline.confidence)} it will be{" "}
                {data.nextSgpa.headline.flagged ? "below" : "at or above"} 6.0.
              </p>
              <p className="mt-2 text-[11px] text-slate-500">
                Trained on {data.nextSgpa.reliability.rows} records. Typical error{" "}
                {data.nextSgpa.reliability.mae} (R² {data.nextSgpa.reliability.r2}).
              </p>
            </div>
          )}
          {data.interview && (
            <div className="rounded-xl border border-[#D9E1EC] bg-[#f8f9ff] p-4">
              <p className={EYEBROW}>Expected mock-interview score</p>
              <p className="cp-num mt-1 text-3xl font-bold text-[#00205f]">
                {data.interview.value}{" "}
                <span className="text-xs font-medium text-slate-500">
                  / 100 (90% range {Math.round(data.interview.interval.low)} –{" "}
                  {Math.round(data.interview.interval.high)})
                </span>
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {confidence(data.interview.headline.confidence)} you will be{" "}
                {data.interview.headline.flagged ? "below" : "at or above"} the readiness line of
                60.
              </p>
              {data.interview.improve?.length > 0 && (
                <p className="mt-2 text-xs text-slate-600">
                  What would raise it most:{" "}
                  {data.interview.improve.map((g, i) => (
                    <span key={g.label}>
                      {i > 0 && ", "}
                      <b className="text-[#16865B]">+{g.gain}</b> {g.label}
                    </span>
                  ))}
                </p>
              )}
              <p className="mt-2 text-[11px] text-slate-500">
                Trained on {data.interview.reliability.rows} records. Typical error{" "}
                {data.interview.reliability.mae} (R² {data.interview.reliability.r2}).
              </p>
            </div>
          )}
        </div>
      )}
      <p className="mt-4 text-xs text-slate-500">
        These are statistical estimates learned from past records. They show what moves with what,
        not a guarantee that a change will cause the result.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------- actions
const PRIORITY = {
  high: ["High priority", "bg-red-50 text-[#C83C4A] border-red-200"],
  medium: ["Medium priority", "bg-amber-50 text-[#B87A0E] border-amber-200"],
  low: ["Low priority", "bg-slate-50 text-slate-600 border-slate-200"],
};
function Actions({ actions }) {
  return (
    <section className={`${CARD} p-5`} aria-label="Recommended action plan">
      <CardTitle icon={Lightbulb}>Recommended action plan</CardTitle>
      {actions.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          No actions needed right now. Keep your current routine going.
        </p>
      ) : (
        <ul className="space-y-3">
          {actions.slice(0, 6).map((a, i) => {
            const [text, cls] = PRIORITY[a.priority] ?? PRIORITY.low;
            return (
              <li key={i} className="rounded-lg border border-[#D9E1EC] bg-[#f8f9ff] p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={cn(
                      "rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                      cls,
                    )}
                  >
                    {text}
                  </span>
                  <span className="text-[11px] text-slate-500">Owner: {a.owner}</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-[#00205f]">{a.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{a.detail}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- rule-based risk + score
const LEVEL_COLOR = { High: C.risk, Medium: C.warn, Low: C.ok, "Insufficient data": "#94a3b8" };
function Flag({ title, flag, to, link }) {
  const points = flag.drivers.reduce((a, d) => a + d.points, 0);
  return (
    <div
      className="rounded-lg border border-[#D9E1EC] p-4"
      style={{ borderTop: `3px solid ${LEVEL_COLOR[flag.level]}` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-[#00205f]">{title}</p>
        <Pill value={flag.level}>
          {flag.level}
          {flag.drivers.length ? ` (${points} pt${points === 1 ? "" : "s"})` : ""}
        </Pill>
      </div>
      {flag.drivers.length === 0 ? (
        <p className="mt-2 text-sm text-[#16865B]">
          {flag.level === "Insufficient data"
            ? "Nothing is recorded for these signals yet."
            : "No risk signal has triggered."}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100 text-sm">
          {flag.drivers.map((d) => (
            <li key={d.signal} className="flex justify-between gap-3 py-1.5">
              <span>
                {d.signal}{" "}
                <span className="text-xs text-slate-500">
                  ({d.value}; rule: {d.threshold})
                </span>
              </span>
              <b className="shrink-0 text-[#C83C4A]">+{d.points}</b>
            </li>
          ))}
        </ul>
      )}
      {flag.insufficient.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          Not counted, nothing recorded: {flag.insufficient.join(", ")}
        </p>
      )}
      <Link
        to={to}
        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#0066CC] hover:underline"
      >
        {link} <ArrowRight className="size-3" />
      </Link>
    </div>
  );
}

const PART_LABEL = {
  academics: "Academics",
  attendance: "Attendance",
  lms: "LMS & submissions",
  engagement: "Engagement",
  skills: "Skills",
  placement: "Placement readiness",
};
function ScoreMakeup({ s, score }) {
  const { components } = successScore(s);
  return (
    <section className={`${CARD} p-5`} aria-label="What makes up your Success Score">
      <CardTitle
        icon={Target}
        right={
          <span className="text-right">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Total score
            </span>
            <span className="cp-num text-2xl font-bold text-[#00205f]">
              {score === null ? "—" : score}
              <span className="text-xs font-medium text-slate-400"> / 100</span>
            </span>
          </span>
        }
      >
        What makes up your Success Score
      </CardTitle>
      <p className="-mt-2 mb-4 text-xs text-slate-500">
        Each area counts towards your score by its weight; an area with nothing recorded is left
        out, never counted as zero.
      </p>
      <div className="space-y-4">
        {Object.keys(PART_LABEL).map((k) => {
          const v = components[k];
          return (
            <div key={k}>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="font-medium text-[#151c25]">
                  {PART_LABEL[k]}{" "}
                  <span className="text-xs font-normal text-slate-400">
                    (counts {Math.round(DEFAULT_WEIGHTS[k] ?? 0)}%)
                  </span>
                </span>
                <span className="font-bold tabular-nums text-[#00205f]">
                  {v === null ? "—" : Math.round(v)}
                  {v !== null && <span className="text-xs font-normal text-slate-400"> / 100</span>}
                </span>
              </div>
              <Meter value={v ?? 0} color={v === null ? "#cbd5e1" : NAVY} />
              {v === null && <p className="mt-1 text-xs text-slate-500">Not recorded yet</p>}
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-slate-500">
        Full history on{" "}
        <Link to="/portal/results" className="font-semibold text-[#0066CC] hover:underline">
          Results
        </Link>{" "}
        and{" "}
        <Link to="/portal/skills" className="font-semibold text-[#0066CC] hover:underline">
          Skills
        </Link>
        .
      </p>
    </section>
  );
}

// ---------------------------------------------------------------- the page
export function PredictiveRisk() {
  const { myRow, today } = useCampus();
  const qc = useQueryClient();
  const pred = useQuery({
    queryKey: ["prediction", "me"],
    queryFn: () => loadStudentPrediction({ data: {} }),
  });
  const inputs = useQuery({
    queryKey: ["prediction-inputs", "me", "coding"],
    queryFn: () => loadPredictionInputs({ data: {} }),
    enabled: Boolean(pred.data?.canEditCoding),
  });
  const recalculating = pred.isFetching;
  const recalc = () =>
    Promise.all(
      ["prediction", "prediction-inputs", "learned", "agent-plans"].map((k) =>
        qc.invalidateQueries({ queryKey: [k] }),
      ),
    );
  const s = myRow.s;
  const acad = academicRisk(s);
  const place = placementRisk(s);
  return (
    <div className="space-y-5 pb-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className={cn(EYEBROW, "flex items-center gap-1.5")}>
            <Brain className="size-3.5" /> Analytical predictive suite
          </p>
          <h1 className="mt-1 text-[2.25rem] font-bold leading-tight tracking-tight text-[#00205f]">
            Predictive Risk &amp; AI
          </h1>
          <p className="mt-1 max-w-2xl text-[0.9375rem] text-[#444652]">
            Predicted placement and results, your risk level, what to do about it, and what drives
            your Success Score.
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-[#D9E1EC] bg-white px-3.5 py-2 text-sm font-semibold text-[#00205f] shadow-xs hover:bg-slate-50"
          >
            <Printer className="size-4" /> Export (print / PDF)
          </button>
          <button
            type="button"
            onClick={recalc}
            disabled={recalculating}
            className="inline-flex items-center gap-2 rounded-lg bg-[#00338D] px-3.5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-[#00205f] disabled:opacity-70"
          >
            <RefreshCw className={cn("size-4", recalculating && "animate-spin")} /> Recalculate
          </button>
        </div>
      </header>

      {pred.isLoading ? (
        <PageSkeleton rows={3} />
      ) : pred.error ? (
        <ErrorState error={pred.error} onRetry={pred.refetch} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-blue-100 bg-[#eef4ff] px-4 py-3 text-sm">
            <Pill value={pred.data.risk.level}>Risk level: {pred.data.risk.level}</Pill>
            <span className="text-[#151c25]">{pred.data.risk.reasons.slice(0, 2).join(" ")}</span>
            <span className="ml-auto font-mono text-[11px] text-slate-500">
              Fixed-weight scores + linear-regression models
            </span>
          </div>

          <Attention s={s} today={today} />

          <div className="grid gap-5 xl:grid-cols-2">
            <PlacementCard
              placement={pred.data.placement}
              coding={inputs.data?.coding}
              canEditCoding={pred.data.canEditCoding}
            />
            <ResultCard result={pred.data.result} />
          </div>

          <Models />

          <div className="grid gap-5 xl:grid-cols-2">
            <Actions actions={pred.data.actions} />
            <PredictionCoach className={`${CARD} space-y-3 p-5`} />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className={`${CARD} p-5`} aria-label="Risk identification breakdown">
              <CardTitle icon={ShieldAlert}>Risk identification breakdown</CardTitle>
              <p className="-mt-2 mb-4 text-xs text-slate-500">
                Counted from the configured academic and placement rules, not a prediction.
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <Flag
                  title="Academic risk"
                  flag={acad}
                  to="/portal/attendance"
                  link="Attendance & class schedules"
                />
                <Flag
                  title="Placement risk"
                  flag={place}
                  to="/portal/placement"
                  link="Placement readiness"
                />
              </div>
            </section>
            <ScoreMakeup s={s} score={myRow.score} />
          </div>
        </>
      )}
    </div>
  );
}
