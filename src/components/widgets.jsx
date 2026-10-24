import { useEffect, useState } from "react";
import {
  ArrowDownRight,
  Award,
  BarChart3,
  BookOpen,
  Briefcase,
  CalendarCheck,
  Check,
  CircleCheck,
  Eye,
  Gauge,
  GraduationCap,
  Minus,
  OctagonAlert,
  TriangleAlert,
  UserCheck,
  Users,
} from "lucide-react";
import { riskBand } from "@/lib/types";
import { cn } from "@/lib/utils";
// Each metric keeps its own hairline icon so a row of figures is recognisable at a glance.
// The icon is never a coloured chip: colour in this system means risk, not decoration.
const METRICS = [
  [/score|average score/i, Gauge],
  [/cgpa|sgpa|grade/i, GraduationCap],
  [/attend|classes/i, CalendarCheck],
  [/lms|assess|learn/i, BookOpen],
  [/placement|aptitude|coding/i, Briefcase],
  [/alert|need|help|backlog|overdue/i, TriangleAlert],
  [/follow|teacher|mentor/i, UserCheck],
  [/student|branch|total/i, Users],
  [/best|subject/i, Award],
];
const FIGURE_TONE = {
  default: "text-foreground",
  success: "text-risk-track",
  warning: "text-risk-monitor",
  danger: "text-risk-critical",
};
// The micro trend mark beside the numeral. Shape carries the meaning, colour only reinforces it.
const FIGURE_MARK = {
  success: [Check, "text-risk-track", "within target"],
  warning: [Minus, "text-risk-monitor", "needs watching"],
  danger: [ArrowDownRight, "text-risk-critical", "below target"],
};

/**
 * The signature mark of the product: a figure set as typesetting rather than as widget
 * output. Small-caps label, an oversized tabular numeral sitting on a 1px baseline rule,
 * a micro mark beside it. A row of these scans in one pass like a printed results table.
 */
export function StatCard({ label, value, sub, tone }) {
  const [, Icon] = METRICS.find(([re]) => re.test(label)) ?? [null, BarChart3];
  const [MarkIcon, markClass, markText] = FIGURE_MARK[tone] ?? [];
  return (
    <div className="stat-tile">
      <p className="stat-label">
        <Icon className="size-3.5 shrink-0 opacity-70" aria-hidden />
        <span className="min-w-0 truncate">{label}</span>
      </p>
      <div className="stat-figure-row">
        <span className={cn("stat-figure", FIGURE_TONE[tone ?? "default"])}>{value}</span>
        {MarkIcon && (
          <span className={cn("stat-mark", markClass)}>
            <MarkIcon className="size-4" aria-hidden />
            <span className="sr-only">{markText}</span>
          </span>
        )}
      </div>
      {sub && <p className="stat-sub">{sub}</p>}
    </div>
  );
}
// Risk bands run on their own ramp, kept clear of ink and of the ochre accent.
const BAND_STYLE = {
  "On Track": ["bg-risk-track-pale text-risk-track", CircleCheck],
  Monitor: ["bg-risk-monitor-pale text-risk-monitor", Eye],
  "Needs Attention": ["bg-risk-attention-pale text-risk-attention", TriangleAlert],
  "High Priority": ["bg-risk-critical-pale text-risk-critical", OctagonAlert],
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
  // The ring rides the risk ramp, not the brand hues.
  const color =
    score === null
      ? "var(--rule-strong)"
      : score >= 80
        ? "var(--risk-track)"
        : score >= 65
          ? "var(--risk-monitor)"
          : score >= 50
            ? "var(--risk-attention)"
            : "var(--risk-critical)";
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
          stroke="var(--rule)"
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
      <span
        className="absolute font-numeric font-semibold tabular-nums"
        style={{ fontSize: Math.max(16, Math.round(size * 0.29)), letterSpacing: "-0.03em" }}
      >
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
    <div className="rounded-lg border border-dashed border-rule-strong bg-secondary/40 px-6 py-10 text-center">
      <p className="font-semibold text-foreground">{title}</p>
      {hint && (
        <p className="mx-auto mt-1.5 max-w-prose text-sm leading-relaxed text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
/** Section heads inside data regions stay grotesk; hierarchy comes from the rule and the caps. */
export function SectionTitle({ children, sub }) {
  return (
    <div className="mb-3">
      <h2 className="rule-head">
        <span className="min-w-0">{children}</span>
      </h2>
      {sub && <p className="mt-1.5 text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}
