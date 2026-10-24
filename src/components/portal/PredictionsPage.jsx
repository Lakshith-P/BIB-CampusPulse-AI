import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BellRing, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState, PageSkeleton, useAction } from "@/components/ui-kit";
import { Working } from "@/components/portal/AgentPlanView";
import { PageTitle, RoleGate } from "@/components/portal/PortalShell";
import { ModelReport } from "@/components/portal/LearnedModels";
import { Pill } from "@/components/portal/PredictionPanel";
import { saveCampusIntervention } from "@/lib/campus.functions";
import { loadPredictions, runPredictionAgent } from "@/lib/platform.functions";
import { campusOptions } from "@/lib/use-campus";

const card = "surface space-y-3 p-4";
const label = "text-xs font-semibold uppercase tracking-wide text-label";
const RANK = { High: 0, Medium: 1, Low: 2, "Insufficient data": 3 };
const select = "rounded-md border bg-background p-2 text-sm";

const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/** Predicts every student in scope, raises alerts and lists who to act on first. */
function CohortAgent({ branch }) {
  const qc = useQueryClient();
  const [result, setResult] = useState(null);
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["predictions"] }),
      qc.invalidateQueries({ queryKey: campusOptions.queryKey }),
    ]);
  const { busy, run } = useAction(refresh);

  async function start() {
    const out = await run(
      () => runPredictionAgent({ data: branch ? { branch } : {} }),
      "Prediction agent finished.",
    );
    if (out.ok) setResult(out.result);
  }

  const createAction = (item) => {
    const top = item.actions[0];
    return run(
      () =>
        saveCampusIntervention({
          data: {
            studentId: item.id,
            reason: item.risk.reasons.slice(0, 2).join(" ").slice(0, 900),
            action: (top?.title ?? "Review this student's predictions with them").slice(0, 900),
            priority: item.risk.level === "High" ? "high" : "medium",
            owner: top?.owner ?? "Faculty mentor",
            followUpDate: inDays(item.risk.level === "High" ? 7 : 14),
          },
        }),
      `Support action created for ${item.name}.`,
    );
  };

  return (
    <section className={card} aria-label="Prediction agent">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={label}>
            <Sparkles className="mr-1 inline size-3.5" /> Prediction agent
          </p>
          <p className="max-w-2xl text-xs text-muted-foreground">
            Predicts placement and results for every student in scope, rates each one's risk,
            explains why, proposes actions with an owner, and alerts the student's teacher and the
            administrators about high-risk students.
          </p>
        </div>
        <Button onClick={start} disabled={busy}>
          <Sparkles className="mr-1 size-4" /> Run agent{branch ? ` for ${branch}` : ""}
        </Button>
      </div>
      {busy && (
        <Working
          steps={[
            "Reading marks, attendance, assessments and placement data",
            "Predicting placement and results for each student",
            "Rating risk and comparing with the last run",
            "Alerting teachers and administrators and drafting actions",
          ]}
        />
      )}
      {!busy && result && (
        <div className="space-y-4">
          <p className="text-sm">{result.narrative.text}</p>
          <p className="text-xs text-muted-foreground">
            {result.narrative.model
              ? `Briefing written by ${result.narrative.model}. `
              : "Briefing generated from the figures below. "}
            <BellRing className="mr-1 inline size-3" />
            {result.alertsSent} alert(s) sent to teachers and administrators
            {result.newlyHigh ? `; ${result.newlyHigh} student(s) newly high risk` : ""}.
          </p>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {[
              ["Students", result.scope.students],
              ["High risk", result.levels.High],
              ["Medium risk", result.levels.Medium],
              [
                "Avg placement / result",
                `${result.avgPlacement ?? "—"} / ${result.avgResult ?? "—"}`,
              ],
            ].map(([name, value]) => (
              <div key={name} className="rounded-md bg-muted/40 p-2">
                <dt className="text-xs text-muted-foreground">{name}</dt>
                <dd className="mt-0.5 text-lg font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          {result.weakCriteria.length > 0 && (
            <p className="text-sm">
              <b>Most common placement weaknesses:</b>{" "}
              {result.weakCriteria.map((w) => `${w.label} (${w.students} students)`).join(", ")}
            </p>
          )}
          {result.byBranch.length > 1 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-1">Department</th>
                    <th>Students</th>
                    <th>High risk</th>
                    <th>Avg placement</th>
                    <th>Avg result</th>
                  </tr>
                </thead>
                <tbody>
                  {result.byBranch.map((b) => (
                    <tr key={b.branch} className="border-t">
                      <td className="py-1.5 font-medium">{b.branch}</td>
                      <td>{b.students}</td>
                      <td>{b.high}</td>
                      <td>{b.avgPlacement ?? "—"}</td>
                      <td>{b.avgResult ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div>
            <p className={label}>Watchlist: act on these first</p>
            {result.watchlist.length === 0 ? (
              <p className="text-sm text-muted-foreground">No student is at medium or high risk.</p>
            ) : (
              <ul className="mt-1 divide-y">
                {result.watchlist.map((w) => (
                  <li key={w.id} className="space-y-1 py-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to="/portal/students/$id"
                        params={{ id: w.id }}
                        className="font-semibold text-primary underline-offset-2 hover:underline"
                      >
                        {w.name || w.id}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {w.branch} · {w.gradYear}
                      </span>
                      <Pill value={w.risk.level} />
                      {w.previousLevel && w.previousLevel !== w.risk.level && (
                        <span className="text-xs text-muted-foreground">was {w.previousLevel}</span>
                      )}
                      <span className="text-xs">
                        Placement {w.placement.score ?? "—"} · Result {w.result.score ?? "—"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {w.risk.reasons.slice(0, 2).join(" ")}
                    </p>
                    {w.actions[0] && (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p>
                          <b>Do:</b> {w.actions[0].title}{" "}
                          <span className="text-xs text-muted-foreground">
                            (owner: {w.actions[0].owner})
                          </span>
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => createAction(w)}
                        >
                          Create support action
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export function PredictionsPage() {
  const [branch, setBranch] = useState("");
  const [risk, setRisk] = useState("");
  const [search, setSearch] = useState("");
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["predictions", "all"],
    queryFn: () => loadPredictions({ data: {} }),
  });
  const branches = useMemo(
    () => [...new Set((data ?? []).map((r) => r.branch).filter(Boolean))].sort(),
    [data],
  );
  const rows = useMemo(
    () =>
      (data ?? [])
        .filter((r) => (!branch || r.branch === branch) && (!risk || r.risk.level === risk))
        .filter((r) => !search || `${r.name} ${r.id}`.toLowerCase().includes(search.toLowerCase()))
        .sort(
          (a, b) =>
            RANK[a.risk.level] - RANK[b.risk.level] ||
            (a.result.score ?? 101) - (b.result.score ?? 101),
        ),
    [data, branch, risk, search],
  );

  return (
    <RoleGate allow={["faculty", "admin"]}>
      <PageTitle
        title="Predictions"
        sub="Placement and result predictions, risk levels and recommended actions"
      />
      <div className="space-y-6">
        <CohortAgent branch={branch} />
        <ModelReport />
        <section className={card} aria-label="Student predictions">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or ID"
              aria-label="Search students"
              className={`${select} w-48`}
            />
            <select
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              aria-label="Department"
              className={select}
            >
              <option value="">All departments</option>
              {branches.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
            <select
              value={risk}
              onChange={(e) => setRisk(e.target.value)}
              aria-label="Risk level"
              className={select}
            >
              <option value="">All risk levels</option>
              {["High", "Medium", "Low", "Insufficient data"].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">{rows.length} student(s)</span>
          </div>
          {isLoading ? (
            <PageSkeleton rows={4} />
          ) : error ? (
            <ErrorState error={error} onRetry={refetch} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-1 pr-2">Student</th>
                    <th className="px-1">Placement</th>
                    <th className="px-1">Result</th>
                    <th className="px-1">Risk</th>
                    <th className="pl-1">Why / next step</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t align-top">
                      <td className="py-2 pr-2">
                        <Link
                          to="/portal/students/$id"
                          params={{ id: r.id }}
                          className="font-medium text-primary underline-offset-2 hover:underline"
                        >
                          {r.name || r.id}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {r.id} · {r.branch} · {r.gradYear}
                        </p>
                      </td>
                      <td className="px-1">
                        <p className="tabular font-semibold">{r.placement.score ?? "—"}</p>
                        <Pill value={r.placement.band} />
                        {r.placement.projected !== null &&
                          r.placement.projected !== r.placement.score && (
                            <p className="text-xs text-muted-foreground">
                              to {r.placement.projected}
                            </p>
                          )}
                      </td>
                      <td className="px-1">
                        <p className="tabular font-semibold">
                          {r.result.sgpa ?? "—"}{" "}
                          <span className="text-xs font-normal text-muted-foreground">SGPA</span>
                        </p>
                        <Pill value={r.result.band} />
                      </td>
                      <td className="px-1">
                        <Pill value={r.risk.level} />
                      </td>
                      <td className="pl-1 text-xs">
                        <p className="text-muted-foreground">{r.risk.reasons[0]}</p>
                        {r.actions[0] && <p className="mt-0.5">{r.actions[0].title}</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && (
                <p className="py-4 text-sm text-muted-foreground">
                  No students match these filters.
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </RoleGate>
  );
}
