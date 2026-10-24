import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Briefcase,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  Clock,
  Code,
  Crosshair,
  ExternalLink,
  LineChart,
  Printer,
  Radar,
  ShieldCheck,
  Star,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/widgets";
import { PageTitle, RoleGate } from "@/components/portal/PortalShell";
import { PRODUCT } from "@/components/portal/StudentShell";
import { MyRiskIdentification } from "@/components/portal/RiskIdentification";
import { ScoreInsights } from "@/components/portal/ScoreInsights";
import { liveAssignments, liveNotifications } from "@/lib/live-profile";
import { classesNeededForTarget, componentScores, recommendations } from "@/lib/scoring";
import { useCampus, useCohortStanding } from "@/lib/use-campus";
import { useLeetcodeProfile } from "@/lib/use-leetcode";
import { useDrives, useTimetable } from "@/lib/use-platform";

const C = {
  primary: "#00205f",
  container: "#00338D",
  electric: "#0066CC",
  cyan: "#00B8F5",
  success: "#16865B",
  warning: "#D99216",
  risk: "#C83C4A",
};
const card = "rounded-xl border border-[#D9E1EC] bg-white shadow-xs";
const ATTENDANCE_MIN = 75;
const RISK_FLOOR_SGPA = 6.0;
const BAND_COLOR = {
  "On Track": C.success,
  Monitor: C.warning,
  "Needs Attention": "#C2410C",
  "High Priority": C.risk,
};
const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const fmtPct = (v) => (v === null || v === undefined ? "—" : `${v.toFixed(1)}%`);
const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
const firstName = (name) => {
  const parts = (name || "there").trim().split(/\s+/);
  return /\.$/.test(parts[0]) && parts[1] ? parts[1] : parts[0];
};
const greeting = (h) => (h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");
const minutes = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const clock = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return {
    time: `${String(((h + 11) % 12) + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
    ampm: h < 12 ? "AM" : "PM",
  };
};
const initials = (name) =>
  (name || "")
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

function subjectAttendance(s) {
  return s.subjects
    .filter((x) => x.classesHeld > 0)
    .map((x) => ({
      subject: x.subject,
      held: x.classesHeld,
      attended: x.classesAttended,
      pct: (x.classesAttended / x.classesHeld) * 100,
    }));
}
const lowestOf = (list) => list.reduce((m, x) => (!m || x.pct < m.pct ? x : m), null);

/** Least-squares slope and next-semester projection over the recorded SGPAs. */
function sgpaTrend(grades) {
  const ys = grades.filter((g) => g > 0);
  if (ys.length < 2) return null;
  const n = ys.length;
  const xs = ys.map((_, i) => i + 1);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const slope =
    xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) /
    xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const projected = Math.min(10, Math.max(0, my + slope * (n + 1 - mx)));
  return { slope, projected };
}

// ---------------------------------------------------------------- greeting & KPIs
function Greeting({ s, myRow, alerts, lowest }) {
  const first = firstName(myRow.name || s.name);
  const band = myRow.band;
  const tone = BAND_COLOR[band] ?? "#94A3B8";
  return (
    <div
      className={`${card} flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between`}
    >
      <div>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h1 className="text-[1.75rem] font-semibold leading-9 tracking-tight text-[#00205f]">
            {greeting(new Date().getHours())}, {first}
          </h1>
          <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-[#16865B]">
            Semester {s.semester} · Class of {s.gradYear}
          </span>
        </div>
        <p className="text-[0.9375rem] text-[#444652]">
          {myRow.score === null ? (
            "Your Success Score appears as soon as your marks and attendance are recorded."
          ) : (
            <>
              Your overall academic and placement readiness is{" "}
              <strong className="font-semibold text-[#00205f]">{band?.toLowerCase()}</strong>.{" "}
              {alerts.length
                ? `${alerts.length} item${alerts.length === 1 ? " needs" : "s need"} your attention.`
                : "Nothing needs your attention right now."}
            </>
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-lg border border-[#D9E1EC] bg-[#eef4ff] px-3 py-1.5 text-slate-700">
          <span className="size-2 rounded-full" style={{ background: tone }} />
          <span className="text-xs font-semibold">Triage Status:</span>
          <span className="text-xs font-bold" style={{ color: tone }}>
            {band ?? "No data yet"}
          </span>
          {lowest && (
            <span className="text-xs text-slate-400">
              · {lowest.subject} ({lowest.pct.toFixed(1)}%)
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#00205f] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#001B54] print:hidden"
        >
          <Printer className="size-4" /> Print Term Brief
        </button>
      </div>
    </div>
  );
}

function Kpi({ accent, label, children, sub, side }) {
  return (
    <div className={`${card} relative flex items-center justify-between p-4`}>
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1 rounded-l-xl"
        style={{ background: accent }}
      />
      <div className="min-w-0 pl-2">
        <span className="block text-[0.6875rem] font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </span>
        <div className="mt-1 flex items-baseline gap-2">{children}</div>
        {sub && <div className="mt-0.5 text-[0.8125rem] text-slate-600">{sub}</div>}
      </div>
      {side}
    </div>
  );
}

function IconBox({ icon: Icon, bg, color }) {
  return (
    <div
      className="flex size-11 shrink-0 items-center justify-center rounded-lg"
      style={{ background: bg, color }}
    >
      <Icon className="size-6" />
    </div>
  );
}

function KpiRow({ s, myRow, cohort, readiness, drives }) {
  const grades = s.semesterGrades.filter((g) => g > 0);
  const delta = grades.length >= 2 ? grades.at(-1) - grades.at(-2) : null;
  const att = myRow.attendance;
  const openDrives = drives.filter((d) => d.open);
  const eligible = openDrives.filter((d) => d.eligibility?.eligible);
  const score = myRow.score;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Kpi
        accent={C.electric}
        label="Success Score"
        sub={
          cohort?.topPercent ? (
            <>
              Top <strong className="font-semibold text-[#00205f]">{cohort.topPercent}%</strong> of{" "}
              {s.branch} cohort ({cohort.rankedOutOf} students)
            </>
          ) : cohort && !cohort.enough ? (
            `Cohort ranking needs ${cohort.minCohort}+ classmates`
          ) : (
            (myRow.band ?? "Not enough data yet")
          )
        }
        side={
          <div className="relative flex size-16 shrink-0 items-center justify-center">
            <svg className="size-16 -rotate-90" viewBox="0 0 36 36" aria-hidden>
              <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#f1f5f9" strokeWidth="3.5" />
              <circle
                cx="18"
                cy="18"
                r="15.9155"
                fill="none"
                stroke={C.electric}
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray={`${score ?? 0}, 100`}
              />
            </svg>
            <TrendingUp className="absolute size-5" style={{ color: C.electric }} />
          </div>
        }
      >
        <span className="cp-num text-[2.25rem] font-bold leading-10 text-[#00205f]">
          {score === null ? "—" : Math.round(score)}
        </span>
        <span className="text-base font-semibold text-slate-400">/ 100</span>
      </Kpi>
      <Kpi
        accent={C.success}
        label="Cumulative GPA"
        sub={
          <span className="flex items-center gap-1.5">
            {delta !== null && (
              <span
                className="inline-flex items-center text-xs font-semibold"
                style={{ color: delta >= 0 ? C.success : C.risk }}
              >
                {delta >= 0 ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
                {delta >= 0 ? "+" : ""}
                {delta.toFixed(2)}
              </span>
            )}
            <span className="text-slate-500">
              {grades.length ? `Last SGPA ${grades.at(-1).toFixed(2)}` : "No SGPA recorded yet"}
            </span>
          </span>
        }
        side={<IconBox icon={Star} bg="#ecfdf5" color={C.success} />}
      >
        <span className="cp-num text-[2.25rem] font-bold leading-10 text-[#00205f]">
          {myRow.cgpa === null ? "—" : myRow.cgpa.toFixed(2)}
        </span>
        <span className="text-base font-semibold text-slate-400">/ 10.0</span>
      </Kpi>
      <Kpi
        accent={att !== null && att < ATTENDANCE_MIN ? C.risk : C.warning}
        label="Attendance Rate"
        sub={
          <>
            Institutional minimum: <strong className="text-slate-800">75.0%</strong>
          </>
        }
        side={<IconBox icon={CalendarCheck} bg="#fffbeb" color={C.warning} />}
      >
        <span className="cp-num text-[2.25rem] font-bold leading-10 text-[#00205f]">
          {fmtPct(att)}
        </span>
      </Kpi>
      <Kpi
        accent={C.primary}
        label="Placement Readiness"
        sub={
          openDrives.length ? (
            <>
              Eligible for{" "}
              <strong className="font-semibold text-[#00205f]">{eligible.length}</strong> of{" "}
              {openDrives.length} open drive{openDrives.length === 1 ? "" : "s"}
            </>
          ) : (
            "No placement drives open right now"
          )
        }
        side={<IconBox icon={Briefcase} bg="#eff6ff" color={C.electric} />}
      >
        <span className="cp-num text-[1.75rem] font-bold leading-9 text-[#00205f]">
          {fmtPct(readiness)}
        </span>
        {openDrives.length > 0 && (
          <span
            className={`rounded px-2 py-0.5 text-[0.6875rem] font-semibold ${eligible.length ? "bg-blue-100 text-[#00338D]" : "bg-slate-100 text-slate-500"}`}
          >
            {eligible.length ? "Eligible" : "Not yet eligible"}
          </span>
        )}
      </Kpi>
    </div>
  );
}

// ---------------------------------------------------------------- analytics
function VelocityChart({ s, cohort, readiness, leetcode, attendanceList }) {
  const grades = s.semesterGrades;
  const trend = sgpaTrend(grades);
  const bench = new Map((cohort?.sgpa ?? []).map((b) => [b.semester, b]));
  const data = grades.map((g, i) => ({
    name: `Sem ${i + 1}`,
    mine: g > 0 ? g : null,
    median: bench.get(i + 1)?.median ?? null,
    top10: bench.get(i + 1)?.top10 ?? null,
  }));
  const canProject = trend && grades.length < 8;
  if (canProject) {
    data[data.length - 1].projected = data[data.length - 1].mine;
    data.push({
      name: `Sem ${grades.length + 1} (Proj)`,
      projected: Math.round(trend.projected * 100) / 100,
      isProj: true,
    });
  }
  const values = data
    .flatMap((d) => [d.mine, d.median, d.top10, d.projected])
    .filter((v) => v != null);
  const yMin = Math.max(0, Math.floor(Math.min(RISK_FLOOR_SGPA, ...values) - 1));
  const hasBench = data.some((d) => d.top10 !== null && d.top10 !== undefined);
  const marks = s.subjects.length
    ? s.subjects.reduce((a, x) => a + x.marks, 0) / s.subjects.length
    : null;
  const lowest = lowestOf(attendanceList);
  const overall = attendanceList.length
    ? (attendanceList.reduce((a, x) => a + x.attended, 0) /
        attendanceList.reduce((a, x) => a + x.held, 0)) *
      100
    : null;
  const recovery =
    lowest && lowest.pct < ATTENDANCE_MIN
      ? classesNeededForTarget(lowest.attended, lowest.held, ATTENDANCE_MIN)
      : null;
  return (
    <div className={`${card} flex flex-col justify-between p-4 xl:col-span-7`}>
      <div>
        <div className="flex flex-col justify-between gap-2 border-b border-[#D9E1EC] pb-2 sm:flex-row sm:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <LineChart className="size-5" style={{ color: C.electric }} />
              <h2 className="text-xl font-semibold text-[#00205f]">Academic Velocity Analytics</h2>
              <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#00338D]">
                SGPA by semester
              </span>
            </div>
            <p className="mt-0.5 text-[0.8125rem] text-slate-500">
              Your semester trajectory benchmarked against your cohort's top decile and the
              academic-risk floor.
            </p>
          </div>
          {trend && (
            <span className="self-start rounded border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 sm:self-auto">
              Trend: {trend.slope >= 0 ? "+" : ""}
              {trend.slope.toFixed(2)} SGPA / sem
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4 pb-2 pt-3 text-xs">
          <Legend color={C.container} label="Your SGPA & projection" />
          <Legend color={C.cyan} label="Cohort top 10%" dashed />
          <Legend color="#94A3B8" label="Cohort median" dashed />
          <Legend color={C.risk} label={`Academic-risk floor (${RISK_FLOOR_SGPA.toFixed(1)})`} />
          {!hasBench && (
            <span className="ml-auto text-[11px] text-slate-400">
              Benchmarks need {cohort?.minCohort ?? 5}+ classmates with results
            </span>
          )}
        </div>
        {grades.length === 0 ? (
          <EmptyState
            title="No semester results yet"
            hint="Your SGPA trajectory appears once semester results are recorded."
          />
        ) : (
          <div className="mt-2 h-64 rounded-lg bg-gradient-to-b from-blue-50/40 to-transparent p-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 10, right: 16, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="cpMine" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={C.container} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={C.container} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#64748B", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[yMin, 10]}
                  tick={{ fill: "#94A3B8", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: C.primary,
                    border: "none",
                    borderRadius: 6,
                    fontSize: 11,
                    color: "#fff",
                  }}
                  labelStyle={{ color: "#fff", fontWeight: 700 }}
                  itemStyle={{ color: "#cbd5e1" }}
                />
                <ReferenceLine
                  y={RISK_FLOOR_SGPA}
                  stroke={C.risk}
                  strokeOpacity={0.6}
                  strokeDasharray="4 4"
                  label={{
                    value: `Risk floor: ${RISK_FLOOR_SGPA.toFixed(1)}`,
                    position: "insideTopRight",
                    fill: C.risk,
                    fontSize: 9,
                    fontWeight: 700,
                  }}
                />
                <Line
                  name="Cohort top 10%"
                  dataKey="top10"
                  stroke={C.cyan}
                  strokeDasharray="4 4"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
                <Line
                  name="Cohort median"
                  dataKey="median"
                  stroke="#94A3B8"
                  strokeDasharray="2 3"
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                />
                <Area
                  name="Your SGPA"
                  dataKey="mine"
                  stroke={C.container}
                  strokeWidth={3}
                  fill="url(#cpMine)"
                  dot={{ r: 3.5, fill: C.container, strokeWidth: 0 }}
                  activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }}
                  connectNulls
                />
                {canProject && (
                  <Line
                    name="Projected"
                    dataKey="projected"
                    stroke={C.electric}
                    strokeDasharray="5 3"
                    strokeWidth={3}
                    connectNulls
                    dot={(p) =>
                      p.payload.isProj ? (
                        <circle
                          key="proj"
                          cx={p.cx}
                          cy={p.cy}
                          r={5}
                          fill={C.cyan}
                          stroke="#fff"
                          strokeWidth={2}
                        />
                      ) : (
                        <g key={p.index} />
                      )
                    }
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        {canProject && (
          <p className="mt-1 text-[10px] text-slate-400">
            Projection is a straight-line fit through your recorded semesters, not a guarantee.
          </p>
        )}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 border-t border-[#D9E1EC] pt-3 md:grid-cols-3">
        <div className="rounded-lg border border-[#D9E1EC] bg-[#eef4ff] p-2.5">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Academic Coursework
          </span>
          <div className="mt-1 flex items-center justify-between">
            <span className="cp-num font-bold text-[#00205f]">{fmtPct(marks)}</span>
            <span
              className="text-xs font-semibold"
              style={{ color: s.backlogs ? C.risk : C.success }}
            >
              {s.backlogs ? `${s.backlogs} backlog${s.backlogs === 1 ? "" : "s"}` : "No backlogs"}
            </span>
          </div>
          <span className="text-[10px] text-slate-500">Average subject marks this semester</span>
        </div>
        <div
          className={`rounded-lg border p-2.5 ${recovery !== null ? "border-amber-200/60 bg-amber-50/50" : "border-[#D9E1EC] bg-[#eef4ff]"}`}
        >
          <span
            className={`block text-[10px] font-bold uppercase tracking-wider ${recovery !== null ? "text-amber-800" : "text-slate-500"}`}
          >
            Attendance Velocity
          </span>
          <div className="mt-1 flex items-center justify-between">
            <span className="cp-num font-bold text-slate-900">{fmtPct(overall)}</span>
            {lowest && (
              <span
                className="truncate pl-2 text-xs font-semibold"
                style={{ color: lowest.pct < ATTENDANCE_MIN ? C.risk : C.success }}
              >
                {lowest.subject} at {lowest.pct.toFixed(0)}%
              </span>
            )}
          </div>
          <span
            className={`text-[10px] font-medium ${recovery !== null ? "text-amber-700" : "text-slate-500"}`}
          >
            {recovery !== null
              ? `Recovery needed: attend the next ${recovery} class${recovery === 1 ? "" : "es"}`
              : "Every subject is at or above 75%"}
          </span>
        </div>
        <div className="rounded-lg border border-[#D9E1EC] bg-[#eef4ff] p-2.5">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Placement &amp; Coding
          </span>
          <div className="mt-1 flex items-center justify-between">
            <span className="cp-num font-bold text-[#00205f]">{fmtPct(readiness)}</span>
            {leetcode?.contestRating ? (
              <span className="text-xs font-semibold" style={{ color: C.electric }}>
                Rating {Math.round(leetcode.contestRating)}
              </span>
            ) : null}
          </div>
          <span className="text-[10px] text-slate-500">
            {leetcode
              ? `${leetcode.totalSolved ?? 0} LeetCode solutions logged`
              : "Link LeetCode on your Profile"}
          </span>
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label, dashed }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="h-1 w-3.5 rounded-full"
        style={
          dashed
            ? {
                background: `repeating-linear-gradient(90deg, ${color} 0 3px, transparent 3px 5px)`,
              }
            : { background: color }
        }
      />
      <span className="font-medium text-slate-700">{label}</span>
    </span>
  );
}

const BAR_COLORS = [C.electric, C.container, C.cyan, "#48b3fe", C.electric, C.container];

function CompetencyVector({ cohort, cohortStatus, drives }) {
  const [mode, setMode] = useState("percentile");
  const list = cohort?.competencies ?? [];
  const open = drives.filter((d) => d.open);
  const eligible = open.filter((d) => d.eligibility?.eligible);
  const blocked = open.find((d) => d.eligibility && !d.eligibility.eligible);
  return (
    <div className={`${card} flex flex-col justify-between p-4 xl:col-span-5`}>
      <div>
        <div className="flex items-start justify-between border-b border-[#D9E1EC] pb-2">
          <div>
            <div className="flex items-center gap-1.5">
              <Radar className="size-5" style={{ color: C.electric }} />
              <h2 className="text-xl font-semibold text-[#00205f]">Cohort Competency Vector</h2>
            </div>
            <p className="mt-0.5 text-[0.8125rem] text-slate-500">
              Your percentile in each Success Score component vs. classmates.
            </p>
          </div>
          <div
            className="inline-flex rounded-md border border-slate-200 bg-slate-100 p-0.5 text-[11px] font-semibold text-slate-600"
            role="group"
            aria-label="Show as"
          >
            {[
              ["percentile", "Percentile"],
              ["delta", "Delta"],
            ].map(([k, l]) => (
              <button
                key={k}
                type="button"
                aria-pressed={mode === k}
                onClick={() => setMode(k)}
                className={`rounded px-2 py-0.5 ${mode === k ? "bg-white text-[#00205f] shadow-xs" : "text-slate-500"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        {cohortStatus === "loading" ? (
          <p className="mt-4 text-sm text-slate-500">Loading cohort comparison…</p>
        ) : cohortStatus === "error" ? (
          <p className="mt-4 text-sm text-[#C83C4A]">
            Could not load the cohort comparison. Refresh to try again.
          </p>
        ) : !cohort ? (
          <p className="mt-4 text-sm text-slate-500">
            No cohort comparison is available for your record yet.
          </p>
        ) : !cohort.enough ? (
          <p className="mt-4 text-sm text-slate-500">
            Comparisons appear once at least {cohort.minCohort} classmates in {cohort.branch},
            semester share data — so no one classmate's numbers can be inferred. Your cohort has{" "}
            {cohort.cohortSize}.
          </p>
        ) : (
          <div className="mt-4 space-y-3.5">
            {list.map((c, i) => {
              const diff = c.mine !== null && c.median !== null ? c.mine - c.median : null;
              const ahead = diff !== null && diff >= 0;
              return (
                <div key={c.key}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">{c.label}</span>
                    <span className="flex items-center gap-2">
                      {mode === "percentile" ? (
                        <span
                          className="font-bold"
                          style={{
                            color:
                              c.percentile !== null && c.percentile < 50 ? C.warning : C.primary,
                          }}
                        >
                          {c.percentile === null ? "—" : `${ordinal(c.percentile)} %tile`}
                        </span>
                      ) : (
                        <span
                          className="font-bold"
                          style={{ color: diff === null ? "#94A3B8" : ahead ? C.success : C.risk }}
                        >
                          {diff === null ? "—" : `${ahead ? "+" : ""}${diff.toFixed(1)} pts`}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400">
                        (Cohort median: {c.median === null ? "—" : Math.round(c.median)})
                      </span>
                    </span>
                  </div>
                  <div className="relative flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                    {c.mine === null ? null : ahead ? (
                      <>
                        <div className="h-full bg-slate-300" style={{ width: `${c.median}%` }} />
                        <div
                          className="h-full"
                          style={{ width: `${diff}%`, background: BAR_COLORS[i] }}
                        />
                      </>
                    ) : (
                      <div
                        className="h-full"
                        style={{ width: `${c.mine}%`, background: C.warning }}
                      />
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-[10px] text-slate-400">
                    <span>
                      {c.mine === null
                        ? "No data recorded yet"
                        : `You: ${Math.round(c.mine)} / 100`}
                    </span>
                    {diff !== null && (
                      <span className="font-semibold" style={{ color: ahead ? C.success : C.risk }}>
                        {ahead ? `+${Math.round(diff)} vs median` : `${Math.round(diff)} deficit`}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-[18px] shrink-0 text-[#00205f]" />
          <div>
            <span className="block text-xs font-bold leading-tight text-[#00205f]">
              Placement Eligibility
            </span>
            <p className="mt-0.5 text-xs text-slate-600">
              {!open.length ? (
                "No placement drives are open right now."
              ) : eligible.length ? (
                <>
                  You qualify for{" "}
                  <strong>
                    {eligible
                      .map((d) => d.company)
                      .slice(0, 3)
                      .join(", ")}
                  </strong>
                  {eligible.length > 3 ? ` and ${eligible.length - 3} more` : ""}.
                  {blocked ? ` ${blocked.company}: ${blocked.eligibility.explanation}` : ""}
                </>
              ) : (
                <>
                  Not yet eligible for any open drive.{" "}
                  {blocked ? `${blocked.company}: ${blocked.eligibility.explanation}` : ""}
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- directives
function directives(s, today, slots, attendanceList) {
  const out = [];
  const pending = liveAssignments(s, today)
    .filter((a) => a.daysLeft !== null)
    .sort((a, b) => a.daysLeft - b.daysLeft)[0];
  if (pending)
    out.push({
      key: "assignment",
      icon: ClipboardList,
      iconBg: "#eff6ff",
      iconColor: C.electric,
      badge:
        pending.daysLeft < 0
          ? `Overdue by ${-pending.daysLeft} day${pending.daysLeft === -1 ? "" : "s"}`
          : pending.daysLeft === 0
            ? "Due today"
            : `Due in ${pending.daysLeft} day${pending.daysLeft === 1 ? "" : "s"}`,
      badgeClass:
        pending.daysLeft <= 2 ? "bg-red-100 text-[#C83C4A]" : "bg-amber-100 text-amber-800",
      context: pending.subject,
      title: `Complete ${pending.title}`,
      body: `Submission deadline ${pending.deadline || "not set"}. Submitting it keeps your LMS credit, which counts towards 15% of your Success Score.`,
      foot: (
        <span className="flex items-center gap-1 text-xs text-slate-400">
          <Clock className="size-3.5" /> Deadline {pending.deadline}
        </span>
      ),
      action: { to: "/portal/lms", label: "Open Assignment", primary: true },
    });
  const lowest = lowestOf(attendanceList);
  if (lowest && lowest.pct < 85) {
    const need = classesNeededForTarget(lowest.attended, lowest.held, ATTENDANCE_MIN);
    const now = new Date();
    const todaySlot = slots.find((x) => x.day === now.getDay() && x.subject === lowest.subject);
    out.push({
      key: "attendance",
      icon: CalendarDays,
      iconBg: "#fffbeb",
      iconColor: C.warning,
      badge: todaySlot
        ? `Today at ${clock(todaySlot.start).time} ${clock(todaySlot.start).ampm}`
        : lowest.pct < ATTENDANCE_MIN
          ? "Below 75%"
          : "Below 85%",
      badgeClass: "bg-amber-100 text-amber-800",
      context: todaySlot?.room || "Attendance",
      title: `Attend ${lowest.subject}${todaySlot ? " today" : ""}`,
      body:
        lowest.pct < ATTENDANCE_MIN
          ? `${need} consecutive attendance${need === 1 ? "" : "s"} needed to bring this subject back to 75%. It currently stands at ${lowest.pct.toFixed(1)}%.`
          : `This is your lowest-attendance subject at ${lowest.pct.toFixed(1)}%. Keeping it above 85% protects your 75% minimum.`,
      foot: (
        <span
          className="flex items-center gap-1 text-xs font-semibold"
          style={{ color: lowest.pct < ATTENDANCE_MIN ? C.risk : C.warning }}
        >
          <AlertTriangle className="size-3.5" /> Current course attendance: {lowest.pct.toFixed(1)}%
        </span>
      ),
      action: { to: "/portal/attendance", label: "View Attendance Planner" },
    });
  }
  for (const text of recommendations(s)) {
    if (out.length >= 2) break;
    if (out.some((d) => d.body === text)) continue;
    out.push({
      key: text,
      icon: Crosshair,
      iconBg: "#eef4ff",
      iconColor: C.primary,
      badge: "Recommended",
      badgeClass: "bg-blue-100 text-[#00338D]",
      context: "From your Success Score",
      title: text.split(" — ")[0].replace(/\.$/, ""),
      body: text,
      foot: null,
      action: { to: "/portal/insights", label: "See why" },
    });
  }
  return out.slice(0, 2);
}

function Directives({ list }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crosshair className="size-5 text-[#00205f]" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#00205f]">
            What You Should Do Today
          </h2>
        </div>
        <span className="text-xs font-semibold text-slate-400">
          {list.length} Priority Directive{list.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {list.map((d) => (
          <div key={d.key} className={`${card} flex flex-col justify-between p-4`}>
            <div className="flex items-start gap-3">
              <div
                className="flex size-10 shrink-0 items-center justify-center rounded-lg"
                style={{ background: d.iconBg, color: d.iconColor }}
              >
                <d.icon className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${d.badgeClass}`}
                  >
                    {d.badge}
                  </span>
                  <span className="truncate text-xs text-slate-500">{d.context}</span>
                </div>
                <h3 className="mt-1 font-semibold text-slate-900">{d.title}</h3>
                <p className="mt-1 text-[0.8125rem] text-slate-600">{d.body}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-2 border-t border-[#D9E1EC] pt-3">
              {d.foot ?? <span />}
              <Link
                to={d.action.to}
                className={
                  d.action.primary
                    ? "inline-flex items-center gap-1 rounded-lg bg-[#00205f] px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#001B54]"
                    : "inline-flex items-center gap-1 rounded-lg border border-[#D9E1EC] px-4 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                }
              >
                {d.action.label}
              </Link>
            </div>
          </div>
        ))}
        {!list.length && (
          <div className={`${card} p-4 text-sm text-[#16865B]`}>
            Nothing urgent today — you are on track everywhere we can measure.
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- operational tabs
function ScheduleTab({ s, myRow, slots, attendanceList, interventions }) {
  const now = new Date();
  const dayIdx = now.getDay();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let showDay = dayIdx;
  let list = slots.filter((x) => x.day === dayIdx);
  if (!list.length)
    for (let k = 1; k <= 6 && !list.length; k++) {
      const d = (dayIdx + k) % 7;
      list = slots.filter((x) => x.day === d);
      if (list.length) showDay = d;
    }
  list = [...list].sort((a, b) => a.start.localeCompare(b.start));
  const isToday = showDay === dayIdx;
  const attBy = new Map(attendanceList.map((a) => [a.subject, a.pct]));
  const remaining = isToday ? list.filter((x) => minutes(x.end) > nowMin).length : list.length;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div className="space-y-3 lg:col-span-8">
        <div className="flex items-center justify-between border-b border-[#D9E1EC] pb-2">
          <span className="text-[0.6875rem] font-bold uppercase tracking-wider text-slate-500">
            {isToday ? "Scheduled Classes Today" : `No classes today · Next: ${DAY[showDay]}`}
          </span>
          <span className="text-xs font-semibold text-[#00205f]">
            {list.length ? `${remaining} Session${remaining === 1 ? "" : "s"} Remaining` : ""}
          </span>
        </div>
        {!list.length && (
          <p className="text-sm text-slate-500">
            Your teachers have not published a timetable yet.
          </p>
        )}
        {list.map((slot) => {
          const pct = attBy.get(slot.subject);
          const critical = pct !== undefined && pct < ATTENDANCE_MIN;
          const done = isToday && minutes(slot.end) <= nowMin;
          const live = isToday && minutes(slot.start) <= nowMin && minutes(slot.end) > nowMin;
          const t = clock(slot.start);
          return (
            <div
              key={slot.id}
              className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${critical && !done ? "border-amber-200/80 bg-amber-50/40" : "border-[#D9E1EC] bg-white"}`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="w-12 shrink-0 text-center">
                  <span className="block text-xs font-bold text-slate-900">{t.time}</span>
                  <span className="block text-[10px] uppercase text-slate-500">{t.ampm}</span>
                </div>
                <div
                  className="h-8 w-1 shrink-0 rounded-full"
                  style={{ background: done ? "#cbd5e1" : critical ? C.warning : C.electric }}
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-xs font-semibold text-slate-900">
                      {slot.subject}
                    </span>
                    {critical && (
                      <span className="rounded bg-amber-100 px-1.5 text-[9px] font-bold uppercase text-amber-800">
                        Attendance Critical
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-500">
                    {slot.room || "Room not set"} · {slot.start}–{slot.end}
                    {pct !== undefined ? ` · your attendance ${pct.toFixed(1)}%` : ""}
                  </span>
                </div>
              </div>
              <span
                className={`shrink-0 rounded border px-2.5 py-1 text-xs font-semibold ${live ? "border-emerald-200 bg-emerald-50 text-[#16865B]" : done ? "border-slate-200 bg-slate-50 text-slate-400" : "border-slate-200 bg-white text-slate-700"}`}
              >
                {live ? "In progress" : done ? "Done" : "Upcoming"}
              </span>
            </div>
          );
        })}
      </div>
      <Advisor s={s} myRow={myRow} interventions={interventions} />
    </div>
  );
}

function Advisor({ s, myRow, interventions }) {
  const open = interventions
    .filter((i) => i.student_id === s.id && i.status !== "resolved")
    .sort((a, b) => a.follow_up_date.localeCompare(b.follow_up_date));
  const next = open[0];
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="flex flex-col justify-between rounded-lg border border-[#D9E1EC] bg-[#eef4ff] p-4 lg:col-span-4">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[0.6875rem] font-bold uppercase tracking-wider text-slate-500">
            Assigned Faculty Mentor
          </span>
        </div>
        {myRow.mentorId ? (
          <div className="flex items-center gap-3 border-b border-[#D9E1EC] pb-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-[#00338D] text-sm font-bold text-white">
              {initials(myRow.mentorName)}
            </span>
            <div className="min-w-0">
              <h4 className="truncate text-xs font-semibold text-slate-900">{myRow.mentorName}</h4>
              <span className="block truncate text-[11px] text-slate-500">{myRow.mentorEmail}</span>
              <span className="text-[10px] font-semibold" style={{ color: C.electric }}>
                Faculty mentor · {s.branch}
              </span>
            </div>
          </div>
        ) : (
          <p className="border-b border-[#D9E1EC] pb-3 text-xs text-slate-500">
            No mentor assigned yet. An administrator assigns one.
          </p>
        )}
        <div className="mt-3 space-y-1.5 text-xs text-slate-600">
          <div className="flex items-center justify-between gap-2">
            <span>Next follow-up:</span>
            <span
              className="font-semibold"
              style={{
                color: next ? (next.follow_up_date < today ? C.risk : C.success) : "#64748b",
              }}
            >
              {next
                ? `${next.follow_up_date}${next.follow_up_date < today ? " (overdue)" : ""}`
                : "None scheduled"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>Open support actions:</span>
            <span className="font-semibold text-slate-800">{open.length}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>Backlog plan:</span>
            <span className="font-semibold text-[#00205f]">
              {s.backlogs
                ? `${s.backlogs} subject${s.backlogs === 1 ? "" : "s"} to clear`
                : "No backlogs"}
            </span>
          </div>
          {next?.action && <p className="pt-1 text-[11px] text-slate-500">Plan: {next.action}</p>}
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 border-t border-[#D9E1EC] pt-3">
        <Link
          to="/portal/chat"
          className="flex-1 rounded-lg border border-slate-200 bg-white py-1.5 text-center text-xs font-semibold text-[#00205f] shadow-xs hover:bg-slate-50"
        >
          Send Message
        </Link>
        {myRow.mentorEmail && (
          <a
            href={`mailto:${myRow.mentorEmail}?subject=${encodeURIComponent(`Meeting request — ${s.name} (${s.id})`)}`}
            className="rounded-lg bg-[#00205f] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#001B54]"
          >
            Schedule Slot
          </a>
        )}
      </div>
    </div>
  );
}

function LmsTab({ s }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-[#00205f]">Curricular Progress &amp; Module Status</h3>
          <p className="text-xs text-slate-500">
            {s.lms.length} course{s.lms.length === 1 ? "" : "s"} on your LMS record
          </p>
        </div>
        <Link
          to="/portal/lms"
          className="flex items-center gap-1 text-xs font-semibold hover:underline"
          style={{ color: C.electric }}
        >
          Open LMS <ExternalLink className="size-3.5" />
        </Link>
      </div>
      {!s.lms.length && <p className="text-sm text-slate-500">No LMS data recorded yet.</p>}
      <div className="space-y-3">
        {s.lms.map((sub) => {
          const lessons = sub.units.flatMap((u) => u.lessons);
          const assignments = sub.units.filter((u) => u.assignment.title !== "—");
          const done =
            lessons.filter((l) => l.completed).length +
            assignments.filter((u) => u.assignment.submitted).length;
          const total = lessons.length + assignments.length;
          const pct = total ? (done / total) * 100 : 0;
          const current =
            sub.units.find(
              (u) =>
                u.lessons.some((l) => !l.completed) ||
                (u.assignment.title !== "—" && !u.assignment.submitted),
            ) ?? sub.units.at(-1);
          const pendingLessons = current
            ? current.lessons.filter((l) => !l.completed).map((l) => l.title)
            : [];
          const graded = assignments.filter((u) => u.assignment.marks !== null).at(-1);
          const due = assignments.find((u) => !u.assignment.submitted);
          const tone = pct >= 60 ? C.primary : C.warning;
          return (
            <div key={sub.subject} className="rounded-lg border border-[#D9E1EC] bg-slate-50 p-3">
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span className="font-bold text-slate-900">
                  {sub.subject}
                  {current && (
                    <span className="font-normal text-slate-500">
                      {" "}
                      · Unit {current.unit} of {sub.units.length}
                      {current.title ? `: ${current.title}` : ""}
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-bold" style={{ color: tone }}>
                  {Math.round(pct)}% Complete
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div className="h-full" style={{ width: `${pct}%`, background: tone }} />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                <span>
                  {pendingLessons.length
                    ? `Pending: ${pendingLessons.slice(0, 2).join(" & ")}`
                    : "All lessons complete"}
                </span>
                {due ? (
                  <span className="font-semibold" style={{ color: C.risk }}>
                    {due.assignment.title}: due {due.assignment.deadline || "date not set"}
                  </span>
                ) : graded ? (
                  <span className="font-medium" style={{ color: C.success }}>
                    {graded.assignment.title}: graded ({graded.assignment.marks})
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlacementTab({ s, drives, readiness }) {
  const list = [...drives].sort((a, b) => Number(b.open) - Number(a.open)).slice(0, 6);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div className="lg:col-span-8">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-bold text-[#00205f]">Drives &amp; Your Eligibility</h3>
          <Link
            to="/portal/placement"
            className="flex items-center gap-1 text-xs font-semibold hover:underline"
            style={{ color: C.electric }}
          >
            All drives <ExternalLink className="size-3.5" />
          </Link>
        </div>
        {!list.length && (
          <p className="text-sm text-slate-500">No placement drives have been posted yet.</p>
        )}
        <div className="space-y-2">
          {list.map((d) => {
            const e = d.eligibility;
            const state = e?.eligible
              ? "eligible"
              : e?.criteria.some((c) => c.result === "Fail")
                ? "no"
                : "unknown";
            return (
              <div
                key={d.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-[#D9E1EC] bg-white p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-900">
                    {d.company} · {d.roleTitle}
                  </p>
                  <p className="truncate text-[11px] text-slate-500">
                    {d.open ? `Apply by ${d.deadline}` : `Closed ${d.deadline}`}
                    {d.package ? ` · ${d.package}` : ""}
                    {d.application ? ` · Application: ${d.application}` : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold uppercase ${state === "eligible" ? "bg-emerald-50 text-[#16865B]" : state === "no" ? "bg-red-50 text-[#C83C4A]" : "bg-amber-50 text-amber-800"}`}
                  title={e?.explanation}
                >
                  {state === "eligible" ? "Eligible" : state === "no" ? "Not eligible" : "Unknown"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="space-y-2 rounded-lg border border-[#D9E1EC] bg-[#eef4ff] p-4 text-xs text-slate-600 lg:col-span-4">
        <span className="block text-[0.6875rem] font-bold uppercase tracking-wider text-slate-500">
          Readiness Inputs
        </span>
        <Row label="Placement readiness" value={fmtPct(readiness)} />
        <Row
          label="Resume completeness"
          value={s.resumeCompleteness >= 0 ? `${s.resumeCompleteness}%` : "Not recorded"}
        />
        <Row
          label="Assessments"
          value={
            s.assessmentsRequired
              ? `${s.assessmentsCompleted} / ${s.assessmentsRequired}`
              : "None required"
          }
        />
        <Row
          label="Mock interviews"
          value={s.mockInterviews === undefined ? "Not recorded" : `${s.mockInterviews} of 3`}
        />
        <Row
          label="Target roles"
          value={s.targetRoles.length ? s.targetRoles.slice(0, 2).join(", ") : "Not set"}
        />
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span>{label}:</span>
      <span className="truncate font-semibold text-slate-800">{value}</span>
    </div>
  );
}

function CodingTab({ s, leetcode, leetcodeLoading }) {
  const skills = [
    ["Coding", s.skills.coding],
    ["Aptitude", s.skills.aptitude],
    ["Analytical", s.skills.analytical],
    ["Verbal", s.skills.verbal],
    ["Communication", s.skills.communication],
  ];
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div className="space-y-3 lg:col-span-7">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-[#00205f]">Skill Assessments</h3>
          <Link
            to="/portal/skills"
            className="flex items-center gap-1 text-xs font-semibold hover:underline"
            style={{ color: C.electric }}
          >
            Skills page <ExternalLink className="size-3.5" />
          </Link>
        </div>
        {skills.map(([label, v]) => (
          <div key={label}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="font-semibold text-slate-800">{label}</span>
              <span
                className="font-bold"
                style={{ color: v < 0 ? "#94A3B8" : v < 60 ? C.risk : C.primary }}
              >
                {v < 0 ? "Not assessed" : `${v} / 100`}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              {v >= 0 && (
                <div
                  className="h-full"
                  style={{ width: `${v}%`, background: v < 60 ? C.warning : C.electric }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-[#D9E1EC] bg-[#eef4ff] p-4 lg:col-span-5">
        <span className="block text-[0.6875rem] font-bold uppercase tracking-wider text-slate-500">
          LeetCode
        </span>
        {leetcodeLoading ? (
          <p className="mt-2 text-xs text-slate-500">Loading…</p>
        ) : !leetcode ? (
          <div className="mt-2 text-xs text-slate-600">
            <p>Link your LeetCode account to track solved problems, ranking and contests here.</p>
            <Button asChild size="sm" className="mt-3 bg-[#00205f] hover:bg-[#001B54]">
              <Link to="/portal/profile">Link LeetCode</Link>
            </Button>
          </div>
        ) : (
          <div className="mt-2">
            <p className="text-xs text-slate-500">leetcode.com/u/{leetcode.username}</p>
            <p className="cp-num mt-1 text-[2rem] font-bold text-[#00205f]">
              {leetcode.totalSolved ?? 0}
              <span className="ml-1 text-sm font-semibold text-slate-400">solved</span>
            </p>
            <div className="mt-1 flex gap-3 text-xs font-semibold">
              <span style={{ color: C.success }}>Easy {leetcode.easySolved ?? 0}</span>
              <span style={{ color: C.warning }}>Medium {leetcode.mediumSolved ?? 0}</span>
              <span style={{ color: C.risk }}>Hard {leetcode.hardSolved ?? 0}</span>
            </div>
            <div className="mt-3 space-y-1.5 text-xs text-slate-600">
              <Row
                label="Contest rating"
                value={leetcode.contestRating ? Math.round(leetcode.contestRating) : "—"}
              />
              <Row
                label="Global ranking"
                value={leetcode.ranking ? `#${leetcode.ranking.toLocaleString()}` : "—"}
              />
              <Row label="Contests attended" value={leetcode.contestCount ?? 0} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const TABS = [
  ["schedule", "Today & Schedule", CalendarDays],
  ["lms", "LMS & Syllabus Track", BookOpen],
  ["placement", "Placement & Eligibility", Briefcase],
  ["coding", "Skills & LeetCode", Code],
];

function Workspace(props) {
  const [tab, setTab] = useState("schedule");
  const date = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  return (
    <div className={`${card} overflow-hidden`}>
      <div className="flex items-center justify-between overflow-x-auto border-b border-[#D9E1EC] bg-slate-50/70 px-4 pt-2">
        <div className="flex items-center gap-2" role="tablist" aria-label="Workspace">
          {TABS.map(([k, label, Icon]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-xs font-semibold tracking-wide ${tab === k ? "border-[#00205f] font-bold text-[#00205f]" : "border-transparent text-slate-500 hover:text-slate-800"}`}
            >
              <Icon className="size-[18px]" />
              {label}
            </button>
          ))}
        </div>
        <span className="hidden shrink-0 pl-3 text-xs font-medium text-slate-400 sm:inline">
          {date} · Semester {props.s.semester}
        </span>
      </div>
      <div className="p-4" role="tabpanel">
        {tab === "schedule" && <ScheduleTab {...props} />}
        {tab === "lms" && <LmsTab s={props.s} />}
        {tab === "placement" && (
          <PlacementTab s={props.s} drives={props.drives} readiness={props.readiness} />
        )}
        {tab === "coding" && (
          <CodingTab
            s={props.s}
            leetcode={props.leetcode}
            leetcodeLoading={props.leetcodeLoading}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- page
export function StudentDashboard() {
  const { myRow, interventions, today } = useCampus();
  const s = myRow?.s;
  const cohortQ = useCohortStanding();
  const timetable = useTimetable();
  const drivesQ = useDrives();
  const leetcodeQ = useLeetcodeProfile(s?.id);
  if (!myRow)
    return (
      <div className="space-y-4">
        <EmptyState
          title="Your account is ready"
          hint="Your student record has not been linked yet. An administrator links it to your account and assigns your mentor. You can already complete your profile."
        />
        <Button asChild>
          <Link to="/portal/profile">Complete my profile</Link>
        </Button>
      </div>
    );
  const alerts = liveNotifications(s, today).filter((n) => n.tone !== "info");
  const attendanceList = subjectAttendance(s);
  const lowest = lowestOf(attendanceList);
  const readiness = componentScores(s).placement;
  const drives = drivesQ.data ?? [];
  const slots = timetable.data?.slots ?? [];
  const cohort = cohortQ.data ?? null;
  const leetcode = leetcodeQ.data ?? null;
  return (
    <div className="flex w-full flex-col gap-6">
      <Greeting s={s} myRow={myRow} alerts={alerts} lowest={lowest} />
      <KpiRow s={s} myRow={myRow} cohort={cohort} readiness={readiness} drives={drives} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <VelocityChart
          s={s}
          cohort={cohort}
          readiness={readiness}
          leetcode={leetcode}
          attendanceList={attendanceList}
        />
        <CompetencyVector
          cohort={cohort}
          cohortStatus={cohortQ.isLoading ? "loading" : cohortQ.isError ? "error" : "ready"}
          drives={drives}
        />
      </div>
      <Directives list={directives(s, today, slots, attendanceList)} />
      <Workspace
        s={s}
        myRow={myRow}
        slots={slots}
        attendanceList={attendanceList}
        interventions={interventions}
        drives={drives}
        readiness={readiness}
        leetcode={leetcode}
        leetcodeLoading={leetcodeQ.isLoading}
      />
      <footer className="flex flex-col items-center justify-between gap-2 border-t border-[#D9E1EC] pb-6 pt-2 text-[11px] text-slate-400 sm:flex-row print:hidden">
        <div>{PRODUCT} · Academic &amp; Placement Performance Platform</div>
        <div className="flex items-center gap-4">
          <Link to="/privacy" className="transition-colors hover:text-slate-600">
            Privacy &amp; Responsible Use
          </Link>
          <Link to="/portal/feedback" className="transition-colors hover:text-slate-600">
            Feedback Centre
          </Link>
          <Link to="/contact" className="transition-colors hover:text-slate-600">
            Support Desk
          </Link>
        </div>
      </footer>
    </div>
  );
}

/** "Predictive Risk & AI": the rule-based risk flags, what needs attention, and what drives the
 * Success Score — the detail behind the triage status on the dashboard. */
export function StudentInsightsPage() {
  const { myRow, today } = useCampus();
  return (
    <RoleGate allow={["student"]}>
      <PageTitle
        title="Predictive Risk & AI"
        sub="Rule-based risk flags, what needs your attention, and what is driving your Success Score."
      />
      {!myRow ? (
        <EmptyState
          title="No student record yet"
          hint="These insights appear once your record is linked."
        />
      ) : (
        <div className="space-y-5">
          <div className={`${card} p-4`}>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-[#00205f]">
              Needs your attention
            </h2>
            <AttentionList s={myRow.s} today={today} score={myRow.score} />
          </div>
          <MyRiskIdentification s={myRow.s} />
          <ScoreInsights s={myRow.s} />
        </div>
      )}
    </RoleGate>
  );
}

function AttentionList({ s, today, score }) {
  const alerts = liveNotifications(s, today).filter((n) => n.tone !== "info");
  if (!alerts.length)
    return (
      <p className="text-sm text-[#16865B]">
        {score === null
          ? "Nothing to show yet. Alerts appear once your marks and attendance are added."
          : "You are on track everywhere."}
      </p>
    );
  return (
    <div className="divide-y divide-[#D9E1EC]">
      {alerts.map((n, i) => (
        <div
          key={i}
          className="border-l-2 py-2.5 pl-3 text-sm"
          style={{ borderLeftColor: n.tone === "danger" ? C.risk : C.warning }}
        >
          <p className="font-medium leading-snug">
            <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {n.area}
            </span>
            {n.text}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">{n.tip}</p>
        </div>
      ))}
    </div>
  );
}
