import { AlertTriangle, Bell, CheckCircle2, Info } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { StatCard, SectionTitle, ProgressBar, EmptyState } from "@/components/widgets";
import { successScore, recommendations, crossSourceInsights } from "@/lib/scoring";
import { academicRisk, placementRisk } from "@/lib/risk-flags";
import { DEFAULT_WEIGHTS } from "@/lib/types";
import { segmentOf } from "@/lib/student-extras";
import { AttendancePlanner } from "@/components/portal/AttendancePlanner";
import { ScoreBreakdown } from "@/components/portal/ScoreBreakdown";

// Profile sections that read only the student's own data, shared by the student's own pages
// and the staff view of a student.
export const LABELS = {
  academics: "Academics",
  attendance: "Attendance",
  lms: "LMS",
  engagement: "Engagement",
  skills: "Skills",
  placement: "Placement readiness",
};
export const card = "surface p-4";
export function FlagBadge({ label, flag }) {
  const cls =
    flag.level === "High"
      ? "bg-destructive/15 text-destructive"
      : flag.level === "Medium"
        ? "bg-warning/15 text-warning"
        : "bg-success/15 text-success";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label ? `${label}: ` : ""}
      {flag.level} ({flag.points} pts)
    </span>
  );
}
export function FlagDrivers({ title, flag }) {
  return (
    <div>
      <p className="mb-1 font-medium">
        {title} — <FlagBadge label="" flag={flag} />
      </p>
      {flag.drivers.length === 0 && (
        <p className="text-sm text-muted-foreground">No signals triggered.</p>
      )}
      <ul className="space-y-1 text-sm">
        {flag.drivers.map((d) => (
          <li key={d.signal} className="flex justify-between gap-2 border-b border-border/50 pb-1">
            <span>
              {d.signal}{" "}
              <span className="text-muted-foreground">
                ({d.value}; {d.threshold})
              </span>
            </span>
            <span className="font-medium text-destructive">+{d.points}</span>
          </li>
        ))}
      </ul>
      {flag.insufficient.length > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          Insufficient data: {flag.insufficient.join(", ")}
        </p>
      )}
    </div>
  );
}
export function NoticeRow({ n }) {
  const Icon =
    n.tone === "danger"
      ? AlertTriangle
      : n.tone === "warning"
        ? Bell
        : n.tone === "success"
          ? CheckCircle2
          : Info;
  const cls =
    n.tone === "danger"
      ? "border-destructive/40 bg-destructive/5 text-destructive"
      : n.tone === "warning"
        ? "border-warning/40 bg-warning/10 text-warning"
        : "border-primary/30 bg-primary/5 text-primary";
  return (
    <div className={`flex gap-3 rounded-lg border p-3 text-sm ${cls}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 animate-pulse" />
      <div>
        <p className="font-medium">
          <span className="mr-1 text-xs uppercase opacity-80">{n.area}</span>
          {n.text}
        </p>
        <p className="text-foreground/80">How to improve: {n.tip}</p>
      </div>
    </div>
  );
}
export function Overview({ s, notes }) {
  const seg = segmentOf(s);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className={`${card} lg:row-span-2`}>
        <SectionTitle sub="Where you are lagging and how to improve">
          Notifications ({notes.length})
        </SectionTitle>
        <div className="space-y-2">
          {notes.length ? (
            notes.map((n, i) => <NoticeRow key={i} n={n} />)
          ) : (
            <p className="text-sm text-success">You're on track everywhere.</p>
          )}
        </div>
      </div>
      <div className="lg:col-span-2">
        <ScoreBreakdown s={s} />
      </div>
      <div className={card}>
        <SectionTitle sub="Grouping used by mentors for targeted support">
          Your segment
        </SectionTitle>
        <p className="font-medium">{seg.name}</p>
        <p className="mt-1 text-sm text-muted-foreground">Suggested plan: {seg.action}</p>
        <p className="mt-3 text-sm font-medium">Next steps</p>
        <ul className="mt-1 list-inside list-disc space-y-1 text-sm">
          {recommendations(s).map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        {crossSourceInsights([s]).map((i, k) => (
          <p key={k} className="mt-2 text-sm">
            <b>{i.type}:</b> <span className="text-muted-foreground">{i.detail}</span>
          </p>
        ))}
      </div>
    </div>
  );
}
export function Academics({ s }) {
  const trend = s.semesterGrades.map((g, i) => ({ sem: `Sem ${i + 1}`, sgpa: g }));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="grid grid-cols-2 gap-3 lg:col-span-2">
        <StatCard
          label="Backlogs"
          value={String(s.backlogs)}
          tone={s.backlogs ? "danger" : "success"}
          sub={s.backlogs ? "Clear in next re-exam" : "None"}
        />
        <StatCard
          label="Best subject"
          value={[...s.subjects].sort((a, b) => b.marks - a.marks)[0]?.subject ?? "—"}
        />
      </div>
      <div className={card}>
        <SectionTitle sub="SGPA by semester">CGPA trend</SectionTitle>
        {trend.length === 0 && (
          <p className="text-sm text-muted-foreground">No semester grades recorded yet.</p>
        )}
        <div className={trend.length ? "h-56" : "hidden"}>
          <ResponsiveContainer>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="sem" fontSize={12} />
              <YAxis domain={[0, 10]} fontSize={12} />
              <Tooltip />
              <Line
                isAnimationActive={false}
                dataKey="sgpa"
                stroke="var(--primary)"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className={card}>
        <SectionTitle sub="Marks out of 100 this semester">Subject performance</SectionTitle>
        {s.subjects.length === 0 && (
          <p className="text-sm text-muted-foreground">No subject marks recorded yet.</p>
        )}
        {s.subjects.map((x) => (
          <div key={x.subject} className="mb-3">
            <div className="flex justify-between text-sm">
              <span>{x.subject}</span>
              <span className={x.marks < 60 ? "text-destructive" : ""}>
                {x.marks} ·{" "}
                {x.marks >= 85
                  ? "Excellent"
                  : x.marks >= 70
                    ? "Good"
                    : x.marks >= 60
                      ? "Average"
                      : "Needs work"}
              </span>
            </div>
            <ProgressBar
              value={x.marks}
              {...(x.marks < 60 ? { tone: "var(--destructive)" } : {})}
            />
            {x.marks < 70 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Tip: revisit the weakest LMS unit for {x.subject} and attend the faculty doubt hour.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Attendance({ s }) {
  return <AttendancePlanner s={s} />;
}
