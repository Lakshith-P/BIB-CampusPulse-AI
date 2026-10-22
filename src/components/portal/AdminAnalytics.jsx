import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, X } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { EmptyState, ProgressBar, SectionTitle, StatCard } from "@/components/widgets";
import { StatusPill } from "@/components/ui-kit";
import { averages } from "@/lib/campus-derive";
import {
  byBranch,
  dataQuality,
  filterRows,
  interventionProgress,
  riskSegmentation,
  scoreDistribution,
  semesterTrend,
} from "@/lib/analytics";
import { useCampus } from "@/lib/use-campus";

const card = "surface p-4";
const BAND_FILL = {
  "On Track": "var(--success)",
  Monitor: "var(--info)",
  "Needs Attention": "var(--warning)",
  "High Priority": "var(--destructive)",
};
const LEVEL_TONE = {
  High: "danger",
  Medium: "warning",
  Low: "success",
  "Insufficient data": "neutral",
};
const METRICS = [
  ["score", "Success score", 0],
  ["attendance", "Attendance %", 1],
  ["lms", "LMS %", 1],
  ["placement", "Placement readiness", 0],
];
const selectClass = "rounded-md border bg-card px-3 py-1.5 text-sm";
const fmt = (v, d = 0, suffix = "") =>
  v === null || v === undefined ? "—" : v.toFixed(d) + suffix;

function Chart({ label, children, height = "h-60" }) {
  return (
    <div className={height} role="img" aria-label={label}>
      <ResponsiveContainer>{children}</ResponsiveContainer>
    </div>
  );
}

/** Executive analytics: every number and chart follows the filters. */
export function AdminAnalytics() {
  const { rows, interventions, today } = useCampus();
  const [filters, setFilters] = useState({ branch: "", year: 0, cohort: 0, band: "" });
  const [metric, setMetric] = useState("score");
  const [drill, setDrill] = useState(null);
  const set = (patch) => {
    setDrill(null);
    setFilters((f) => ({ ...f, ...patch }));
  };

  const branches = useMemo(() => [...new Set(rows.map((r) => r.branch))].sort(), [rows]);
  const cohorts = useMemo(() => [...new Set(rows.map((r) => r.s.gradYear))].sort(), [rows]);
  const shown = useMemo(() => filterRows(rows, filters), [rows, filters]);
  const dist = useMemo(() => scoreDistribution(shown), [shown]);
  const branchRows = useMemo(() => byBranch(shown), [shown]);
  const trend = useMemo(() => semesterTrend(shown), [shown]);
  const risks = useMemo(() => riskSegmentation(shown), [shown]);
  const quality = useMemo(() => dataQuality(shown), [shown]);
  const support = useMemo(
    () => interventionProgress(interventions, shown, today),
    [interventions, shown, today],
  );
  const avg = useMemo(() => averages(shown), [shown]);
  const active = filters.branch || filters.year || filters.cohort || filters.band;
  const metricMeta = METRICS.find(([k]) => k === metric);

  return (
    <section className="mt-6" aria-label="Campus analytics">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <SectionTitle sub="Every figure below responds to these filters">
          Executive analytics
        </SectionTitle>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Branch"
            value={filters.branch}
            onChange={(e) => set({ branch: e.target.value })}
            className={selectClass}
          >
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
          <select
            aria-label="Year of study"
            value={filters.year}
            onChange={(e) => set({ year: Number(e.target.value) })}
            className={selectClass}
          >
            <option value={0}>All years</option>
            {[1, 2, 3, 4].map((y) => (
              <option key={y} value={y}>
                Year {y}
              </option>
            ))}
          </select>
          <select
            aria-label="Graduation cohort"
            value={filters.cohort}
            onChange={(e) => set({ cohort: Number(e.target.value) })}
            className={selectClass}
          >
            <option value={0}>All cohorts</option>
            {cohorts.map((c) => (
              <option key={c} value={c}>
                Batch {c}
              </option>
            ))}
          </select>
          <select
            aria-label="Risk band"
            value={filters.band}
            onChange={(e) => set({ band: e.target.value })}
            className={selectClass}
          >
            <option value="">All risk bands</option>
            {Object.keys(BAND_FILL).map((b) => (
              <option key={b}>{b}</option>
            ))}
            <option value="nodata">No data yet</option>
          </select>
          {active ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => set({ branch: "", year: 0, cohort: 0, band: "" })}
            >
              <X /> Clear filters
            </Button>
          ) : null}
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState title="No students match these filters" hint="Clear a filter to see more." />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatCard
              label="Students in view"
              value={String(shown.length)}
              sub={`${rows.length} on campus`}
            />
            <StatCard label="Avg success score" value={fmt(avg.avgScore, 1)} sub="out of 100" />
            <StatCard
              label="Avg attendance"
              value={fmt(avg.avgAtt, 1, "%")}
              tone={avg.avgAtt !== null && avg.avgAtt < 75 ? "danger" : "default"}
            />
            <StatCard label="LMS completion" value={fmt(avg.avgLms, 1, "%")} />
            <StatCard label="Placement readiness" value={fmt(avg.avgPlace, 1, "%")} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className={card}>
              <SectionTitle sub="Select a bar to filter everything to that band">
                Success Score distribution
              </SectionTitle>
              <Chart label="Students per risk band">
                <BarChart data={dist.bands}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="band" fontSize={11} />
                  <YAxis allowDecimals={false} fontSize={11} />
                  <Tooltip cursor={{ fill: "var(--accent)" }} />
                  <Bar
                    dataKey="count"
                    name="Students"
                    radius={[4, 4, 0, 0]}
                    cursor="pointer"
                    isAnimationActive={false}
                    onClick={(d) => set({ band: filters.band === d.band ? "" : d.band })}
                  >
                    {dist.bands.map((b) => (
                      <Cell
                        key={b.band}
                        fill={BAND_FILL[b.band]}
                        fillOpacity={!filters.band || filters.band === b.band ? 1 : 0.35}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </Chart>
              <p className="mt-1 text-xs text-muted-foreground">
                {dist.noData} student(s) have no score yet and are not drawn.
              </p>
            </div>

            <div className={card}>
              <SectionTitle sub="Average SGPA across the semesters recorded">
                Academic trend by semester
              </SectionTitle>
              {trend.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No semester grades recorded for these students.
                </p>
              ) : (
                <Chart label="Average SGPA per semester">
                  <LineChart data={trend}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis dataKey="semester" fontSize={11} tickFormatter={(v) => `Sem ${v}`} />
                    <YAxis domain={[0, 10]} fontSize={11} />
                    <Tooltip
                      formatter={(v, _n, p) => [
                        `${Number(v).toFixed(2)} (${p.payload.students} students)`,
                        "Avg SGPA",
                      ]}
                      labelFormatter={(v) => `Semester ${v}`}
                    />
                    <Line
                      dataKey="sgpa"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      dot
                      isAnimationActive={false}
                    />
                  </LineChart>
                </Chart>
              )}
            </div>

            <div className={card}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <SectionTitle sub="Average per branch for the chosen measure">
                  Branch comparison
                </SectionTitle>
                <div className="flex flex-wrap gap-1" role="group" aria-label="Measure">
                  {METRICS.map(([key, label]) => (
                    <Button
                      key={key}
                      type="button"
                      size="xs"
                      aria-pressed={metric === key}
                      variant={metric === key ? "default" : "outline"}
                      onClick={() => setMetric(key)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
              <Chart label={`${metricMeta[1]} by branch`}>
                <BarChart data={branchRows.map((b) => ({ ...b, value: b[metric] }))}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="branch" fontSize={11} />
                  <YAxis domain={[0, 100]} fontSize={11} />
                  <Tooltip formatter={(v) => (v === null ? "No data" : Number(v).toFixed(1))} />
                  <Bar
                    dataKey="value"
                    name={metricMeta[1]}
                    fill="var(--primary)"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </Chart>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-1">Branch</th>
                      <th>Students</th>
                      <th>Avg CGPA</th>
                      <th>Attendance</th>
                      <th>LMS</th>
                      <th>Need help</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branchRows.map((b) => (
                      <tr key={b.branch} className="border-t">
                        <td className="py-1.5">
                          <button
                            type="button"
                            className="text-primary hover:underline"
                            onClick={() => set({ branch: b.branch })}
                          >
                            {b.branch}
                          </button>
                        </td>
                        <td className="tabular-nums">{b.students}</td>
                        <td className="tabular-nums">{fmt(b.cgpa, 2)}</td>
                        <td className="tabular-nums">{fmt(b.attendance, 1, "%")}</td>
                        <td className="tabular-nums">{fmt(b.lms, 0, "%")}</td>
                        <td
                          className={`tabular-nums ${b.atRisk ? "font-semibold text-destructive" : ""}`}
                        >
                          {b.atRisk}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={card}>
              <SectionTitle sub="Select a count to list the students behind it">
                Risk segmentation
              </SectionTitle>
              {risks.map((group) => (
                <div key={group.key} className="mb-3">
                  <p className="mb-1 text-sm font-medium">{group.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {group.levels.map((l) => (
                      <button
                        key={l.level}
                        type="button"
                        disabled={!l.students.length}
                        aria-pressed={drill?.key === group.key && drill.level === l.level}
                        onClick={() =>
                          setDrill(
                            drill?.key === group.key && drill.level === l.level
                              ? null
                              : {
                                  key: group.key,
                                  label: group.label,
                                  level: l.level,
                                  students: l.students,
                                },
                          )
                        }
                        className="disabled:opacity-50"
                      >
                        <StatusPill tone={LEVEL_TONE[l.level]}>
                          {l.level}: {l.students.length}
                        </StatusPill>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {drill && (
                <div className="mt-3 rounded-lg border p-3" aria-live="polite">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium">
                      {drill.label}: {drill.level} ({drill.students.length})
                    </p>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      aria-label="Close list"
                      onClick={() => setDrill(null)}
                    >
                      <X />
                    </Button>
                  </div>
                  <ul className="max-h-48 divide-y overflow-y-auto text-sm">
                    {drill.students.map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-2 py-1.5">
                        <Link
                          to="/portal/students/$id"
                          params={{ id: s.id }}
                          className="font-medium text-primary hover:underline"
                        >
                          {s.name}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {s.branch} · Year {s.year} · {s.riskDriver ?? "no signal"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className={card}>
              <SectionTitle sub="Students with each source recorded">
                Data-source coverage
              </SectionTitle>
              <div className="space-y-3">
                {quality.coverage.map((c) => (
                  <div key={c.key}>
                    <div className="flex justify-between text-sm">
                      <span>{c.label}</span>
                      <span className="tabular-nums">
                        {c.have}/{shown.length} · {c.pct.toFixed(0)}%
                      </span>
                    </div>
                    <ProgressBar
                      value={c.pct}
                      tone={
                        c.pct < 50
                          ? "var(--destructive)"
                          : c.pct < 90
                            ? "var(--warning)"
                            : undefined
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className={card}>
              <SectionTitle sub="Gaps that make scores less reliable">
                Data-quality alerts
              </SectionTitle>
              {quality.alerts.length === 0 ? (
                <p className="text-sm text-success">
                  Every source is recorded for every student in view.
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {quality.alerts.map((a) => (
                    <li key={a.key} className="flex items-start gap-2">
                      <AlertTriangle
                        className={`mt-0.5 size-4 shrink-0 ${a.severity === "high" ? "text-destructive" : "text-warning"}`}
                        aria-hidden
                      />
                      <span>
                        <b>{a.severity === "high" ? "High: " : "Medium: "}</b>
                        {a.text}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className={`${card} lg:col-span-2`}>
              <SectionTitle sub="Support actions for the students in view">
                Intervention progress
              </SectionTitle>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <StatCard label="Support actions" value={String(support.total)} />
                <StatCard label="Open" value={String(support.open)} />
                <StatCard label="In progress" value={String(support.inProgress)} />
                <StatCard label="Resolved" value={String(support.resolved)} tone="success" />
                <StatCard
                  label="Overdue follow-ups"
                  value={String(support.overdue)}
                  tone={support.overdue ? "danger" : "success"}
                  sub={
                    support.resolutionRate === null
                      ? undefined
                      : `${support.resolutionRate.toFixed(0)}% resolved`
                  }
                />
              </div>
              {support.outcomes.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1 text-xs font-semibold uppercase text-label">Recent outcomes</p>
                  <ul className="space-y-1 text-sm">
                    {support.outcomes.map((o) => (
                      <li key={o.id}>
                        <span className="font-medium">{o.studentId}</span>: {o.outcome}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
