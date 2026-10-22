import { useEffect, useState } from "react";
import {
  Award,
  BarChart3,
  BookOpen,
  Briefcase,
  CalendarCheck,
  CircleCheck,
  Eye,
  Gauge,
  GraduationCap,
  OctagonAlert,
  TriangleAlert,
  UserCheck,
  Users,
} from "lucide-react";
import { riskBand } from "@/lib/types";
import { cn } from "@/lib/utils";
// Each metric gets its own icon and colour so a row of stats reads at a glance.
const HUES = {
  emerald: "bg-emerald-400/15 text-emerald-300",
  indigo: "bg-indigo-400/15 text-indigo-300",
  sky: "bg-sky-400/15 text-sky-300",
  violet: "bg-violet-400/15 text-violet-300",
  amber: "bg-amber-400/15 text-amber-300",
  rose: "bg-rose-400/15 text-rose-300",
  teal: "bg-teal-400/15 text-teal-300",
};
const METRICS = [
  [/score|average score/i, Gauge, "emerald"],
  [/cgpa|sgpa|grade/i, GraduationCap, "indigo"],
  [/attend|classes/i, CalendarCheck, "sky"],
  [/lms|assess|learn/i, BookOpen, "violet"],
  [/placement|aptitude|coding/i, Briefcase, "teal"],
  [/alert|need|help|backlog|overdue/i, TriangleAlert, "rose"],
  [/follow|teacher|mentor/i, UserCheck, "amber"],
  [/student|branch|total/i, Users, "indigo"],
  [/best|subject/i, Award, "amber"],
];
export function StatCard({ label, value, sub, tone }) {
  const tones = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
  };
  const [, Icon, hue] = METRICS.find(([re]) => re.test(label)) ?? [null, BarChart3, "teal"];
  const chip =
    tone === "danger"
      ? HUES.rose
      : tone === "warning"
        ? HUES.amber
        : tone === "success"
          ? HUES.emerald
          : HUES[hue];
  return (
    <div className="surface group p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", chip)}>
          <Icon className="size-[18px]" />
        </span>
      </div>
      <div
        className={cn(
          "mt-2 font-display text-3xl font-bold tabular-nums leading-none",
          tones[tone ?? "default"],
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-2 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
const BAND_STYLE = {
  "On Track": ["bg-success/15 text-success", CircleCheck],
  Monitor: ["bg-info/15 text-info", Eye],
  "Needs Attention": ["bg-warning/15 text-warning", TriangleAlert],
  "High Priority": ["bg-destructive/15 text-destructive", OctagonAlert],
};
// Risk is always shown as words plus an icon, never by colour alone.
export function BandBadge({ score }) {
  if (score === null)
    return (
      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
        No data
      </span>
    );
  const band = riskBand(score);
  const [cls, Icon] = BAND_STYLE[band];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        cls,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {band}
    </span>
  );
}
/** The score ring draws itself on first paint; reduced-motion users get it without animation. */
export function ScoreRing({ score, size = 96 }) {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const target = score ?? 0;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(target));
    return () => cancelAnimationFrame(id);
  }, [target]);
  const color =
    score === null
      ? "var(--muted)"
      : score >= 80
        ? "var(--success)"
        : score >= 65
          ? "var(--info)"
          : score >= 40
            ? "var(--warning)"
            : "var(--destructive)";
  return (
    <div
      role="img"
      aria-label={
        score === null
          ? "Success Score not available"
          : `Success Score ${Math.round(score)} out of 100`
      }
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--border)"
          strokeWidth={8}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - shown / 100)}
          style={{ transition: "stroke-dashoffset 0.9s ease-out" }}
        />
      </svg>
      <span className="absolute font-display text-xl font-bold tabular-nums">
        {score === null ? "—" : Math.round(score)}
      </span>
    </div>
  );
}
export function ProgressBar({ value, tone }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full transition-all"
        style={{
          width: `${Math.min(100, Math.max(0, value))}%`,
          backgroundColor: tone ?? "var(--primary)",
        }}
      />
    </div>
  );
}
export function EmptyState({ title, hint }) {
  return (
    <div className="rounded-xl border border-dashed bg-card/50 p-8 text-center">
      <p className="font-medium text-foreground">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}
export function SectionTitle({ children, sub }) {
  return (
    <div className="mb-3">
      <h2 className="font-display text-lg font-semibold">{children}</h2>
      {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}
