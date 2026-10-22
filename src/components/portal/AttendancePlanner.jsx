import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, OctagonAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, SectionTitle, StatCard } from "@/components/widgets";
import {
  TARGETS,
  combine,
  marksFor,
  plan,
  projectMissing,
  warningFor,
} from "@/lib/attendance-planner";
import { REMAINING_CLASSES_PER_SUBJECT } from "@/lib/student-extras";

const card = "surface p-4";
const fmt = (v) => (v === null ? "—" : `${v.toFixed(1)}%`);

function Warning({ w }) {
  if (!w) return null;
  const breach = w.level === "breach";
  const Icon = breach ? OctagonAlert : AlertTriangle;
  return (
    <div
      role={breach ? "alert" : "note"}
      className={`mt-2 flex gap-2 rounded-lg border p-2 text-sm ${
        breach ? "border-destructive/40 bg-destructive/5" : "border-warning/40 bg-warning/10"
      }`}
    >
      <Icon
        className={`mt-0.5 size-4 shrink-0 ${breach ? "text-destructive" : "text-warning"}`}
        aria-hidden
      />
      <div>
        <p className="font-semibold">
          {breach ? "Below the requirement" : "Approaching the limit"}
        </p>
        <p>Why: {w.reason}</p>
        <p className="text-muted-foreground">What to do: {w.action}</p>
      </div>
    </div>
  );
}

/** The bar shows attendance; the vertical line marks the chosen target. */
function Bar({ pct, target }) {
  const tone =
    pct === null
      ? "bg-muted"
      : pct < 75
        ? "bg-destructive"
        : pct < target
          ? "bg-warning"
          : "bg-success";
  return (
    <div
      className="relative h-3 w-full overflow-hidden rounded-full bg-muted"
      role="img"
      aria-label={`Attendance ${pct === null ? "not recorded" : pct.toFixed(1) + " percent"}, target ${target} percent`}
    >
      <div
        className={`h-full rounded-full transition-all ${tone}`}
        style={{ width: `${Math.min(100, pct ?? 0)}%` }}
      />
      <span
        className="absolute inset-y-0 w-0.5 bg-foreground/60"
        style={{ left: `${target}%` }}
        aria-hidden
      />
    </div>
  );
}

export function AttendancePlanner({ s }) {
  const [target, setTarget] = useState(75);
  const [remaining, setRemaining] = useState(REMAINING_CLASSES_PER_SUBJECT);
  const [missNext, setMissNext] = useState(0);
  const subjects = useMemo(
    () =>
      s.subjects.map((x) => ({
        subject: x.subject,
        held: x.classesHeld,
        attended: x.classesAttended,
      })),
    [s.subjects],
  );
  if (!subjects.length)
    return (
      <EmptyState
        title="No attendance recorded yet"
        hint="Attendance appears here once class counts are added. It is not counted as zero."
      />
    );
  const overall = combine(s.subjects);
  const overallPlan = plan(overall, target, remaining * subjects.length);
  const overallWarning = warningFor(overallPlan, remaining * subjects.length);
  const plans = subjects.map((x) => plan(x, target, remaining));
  const tone = overallPlan.pct < 75 ? "danger" : overallPlan.pct < target ? "warning" : "success";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Classes conducted" value={String(overall.held)} />
        <StatCard label="Attended" value={String(overall.attended)} />
        <StatCard label="Missed" value={String(overall.held - overall.attended)} />
        <StatCard label="Percentage" value={fmt(overallPlan.pct)} tone={tone} />
        <StatCard
          label="Attendance marks"
          value={`${marksFor(overallPlan.pct) ?? "—"} / 5`}
          sub={overallPlan.pct < 75 ? "Below 75%: 0 marks" : undefined}
        />
      </div>
      <Warning w={overallWarning} />

      <div className={`${card} space-y-4`}>
        <SectionTitle sub="Pick the percentage you want to hold, and how many classes are still to come">
          Planner
        </SectionTitle>
        <div className="flex flex-wrap items-end gap-6">
          <div role="group" aria-label="Target attendance">
            <p className="mb-1 text-sm font-medium">Target</p>
            <div className="flex gap-2">
              {TARGETS.map((t) => (
                <Button
                  key={t}
                  type="button"
                  size="sm"
                  aria-pressed={target === t}
                  variant={target === t ? "default" : "outline"}
                  onClick={() => setTarget(t)}
                >
                  {t}%
                </Button>
              ))}
            </div>
          </div>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Classes still to be held, per subject</span>
            <Input
              type="number"
              min={0}
              max={200}
              value={remaining}
              onChange={(e) =>
                setRemaining(Math.max(0, Math.min(200, Number(e.target.value) || 0)))
              }
              className="w-28"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">
              If I miss the next … classes (each subject)
            </span>
            <Input
              type="number"
              min={0}
              max={remaining}
              value={missNext}
              onChange={(e) =>
                setMissNext(Math.max(0, Math.min(remaining, Number(e.target.value) || 0)))
              }
              className="w-28"
            />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          Marks: 90% and above 5 · 85–89.9% 4 · 80–84.9% 3 · 75–79.9% 2 · below 75% 0 marks and a
          warning.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {plans.map((p) => {
          const w = warningFor(p, remaining);
          const projected = projectMissing(p.held, p.attended, remaining, missNext);
          return (
            <section key={p.subject} className={card} aria-label={p.subject}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-lg font-semibold">{p.subject}</h3>
                <p className="text-right font-display text-2xl font-bold tabular-nums">
                  {fmt(p.pct)}
                </p>
              </div>
              <div className="mt-2">
                <Bar pct={p.pct} target={target} />
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <dt className="text-muted-foreground">Conducted</dt>
                  <dd className="text-base font-semibold tabular-nums">{p.held}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Attended</dt>
                  <dd className="text-base font-semibold tabular-nums">{p.attended}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Missed</dt>
                  <dd className="text-base font-semibold tabular-nums">{p.missed}</dd>
                </div>
              </dl>
              <ul className="mt-3 space-y-1 text-sm">
                <li>
                  Marks now: <b>{p.marks ?? "—"} / 5</b>
                </li>
                <li>
                  {p.need === 0 ? (
                    <span className="inline-flex items-center gap-1 text-success">
                      <CheckCircle2 className="size-4" aria-hidden /> Already at {target}% or above
                    </span>
                  ) : p.reachable ? (
                    <>
                      To reach {target}%: attend the next <b>{p.need}</b> class(es) in a row
                    </>
                  ) : (
                    <span className="text-warning">
                      {target}% is out of reach: needs {p.need} classes, {remaining} remain
                    </span>
                  )}
                </li>
                <li>
                  Can still miss <b>{p.canMiss}</b> class(es) and stay at {target}%
                </li>
                <li>
                  If you miss the next {missNext}: <b>{fmt(projected)}</b> by semester end (
                  {marksFor(projected) ?? "—"} marks)
                </li>
              </ul>
              <Warning w={w} />
            </section>
          );
        })}
      </div>

      <div className={card}>
        <SectionTitle sub="Consecutive classes to attend, from today's counts">
          Classes required to reach each level
        </SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2">Subject</th>
                {TARGETS.map((t) => (
                  <th key={t}>{t}%</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subjects.map((x) => (
                <tr key={x.subject} className="border-t">
                  <td className="py-2 font-medium">{x.subject}</td>
                  {TARGETS.map((t) => {
                    const p = plan(x, t, remaining);
                    return (
                      <td key={t} className={`tabular-nums ${p.reachable ? "" : "text-warning"}`}>
                        {p.need === 0 ? "Met" : p.reachable ? p.need : `${p.need} (not reachable)`}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
