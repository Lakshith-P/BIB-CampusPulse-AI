import { Link } from "@tanstack/react-router";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/widgets";
import { FlagBadge } from "@/components/student-profile/shared";
import { academicRisk, placementRisk } from "@/lib/risk-flags";

// Risk identification on the dashboard: which rules fired, the value behind each one and the
// threshold it crossed. Everything here is the configured rule set — never a prediction — and a
// signal with no data recorded is listed as missing instead of counted against anyone.

const card = "surface p-4";
const LEVEL_TONE = {
  High: "border-l-destructive",
  Medium: "border-l-warning",
  Low: "border-l-success",
  "Insufficient data": "border-l-muted-foreground",
};
const ACTION = {
  academic: ["/portal/attendance", "Attendance and classes"],
  placement: ["/portal/placement", "Placement readiness"],
};

function Flag({ kind, title, flag }) {
  const [to, label] = ACTION[kind];
  return (
    <div className={`border-l-2 pl-3 ${LEVEL_TONE[flag.level]}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{title}</p>
        <FlagBadge label="" flag={flag} />
      </div>
      {flag.drivers.length === 0 ? (
        <p className="mt-1.5 text-sm text-success">
          {flag.level === "Insufficient data"
            ? "Nothing is recorded for these signals yet."
            : "No risk signal has triggered."}
        </p>
      ) : (
        <ul className="mt-1.5 divide-y divide-rule text-sm">
          {flag.drivers.map((d) => (
            <li key={d.signal} className="flex justify-between gap-2 py-1">
              <span>
                {d.signal}{" "}
                <span className="text-xs text-muted-foreground">
                  ({d.value}; rule: {d.threshold})
                </span>
              </span>
              <span className="shrink-0 font-medium text-destructive">+{d.points}</span>
            </li>
          ))}
        </ul>
      )}
      {flag.insufficient.length > 0 && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Not counted, nothing recorded: {flag.insufficient.join(", ")}
        </p>
      )}
      <Link
        to={to}
        className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
      >
        {label} <ArrowRight className="size-3" />
      </Link>
    </div>
  );
}

/** A student's own two risk flags, with the signals that produced them. */
export function MyRiskIdentification({ s }) {
  return (
    <section className={card} aria-label="Risk identification">
      <SectionTitle>
        <span className="inline-flex items-center gap-2">
          <ShieldAlert className="size-4 text-primary" /> Risk identification
        </span>
      </SectionTitle>
      <div className="grid gap-4 lg:grid-cols-2">
        <Flag kind="academic" title="Academic risk" flag={academicRisk(s)} />
        <Flag kind="placement" title="Placement risk" flag={placementRisk(s)} />
      </div>
    </section>
  );
}

const LEVELS = ["High", "Medium", "Low", "Insufficient data"];
const PILL = {
  High: "bg-destructive/15 text-destructive",
  Medium: "bg-warning/15 text-warning",
  Low: "bg-success/15 text-success",
  "Insufficient data": "bg-muted text-muted-foreground",
};

/** Risk identification across the students a teacher or administrator can see. */
export function CampusRiskIdentification({ rows }) {
  const count = (key, level) => rows.filter((r) => r[key] === level).length;
  const flagged = rows
    .filter((r) => r.academicRisk === "High" || r.placementRisk === "High")
    .sort((a, b) => b.academicPoints + b.placementPoints - (a.academicPoints + a.placementPoints))
    .slice(0, 8);
  return (
    <section className={`${card} mt-4`} aria-label="Risk identification">
      <SectionTitle sub="Counted from the configured academic and placement rules, not a prediction">
        <span className="inline-flex items-center gap-2">
          <ShieldAlert className="size-4 text-primary" /> Risk identification
        </span>
      </SectionTitle>
      <div className="grid gap-4 lg:grid-cols-2">
        {[
          ["academicRisk", "Academic risk"],
          ["placementRisk", "Placement risk"],
        ].map(([key, label]) => (
          <div key={key}>
            <p className="mb-2 text-xs font-semibold uppercase text-label">{label}</p>
            <ul className="space-y-1 text-sm">
              {LEVELS.map((level) => (
                <li key={level} className="flex items-center justify-between gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${PILL[level]}`}>
                    {level}
                  </span>
                  <span className="font-medium tabular-nums">{count(key, level)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-4">
        <p className="mb-1 text-xs font-semibold uppercase text-label">Students with a High flag</p>
        {flagged.length === 0 ? (
          <p className="text-sm text-success">No student currently carries a High risk flag.</p>
        ) : (
          <ul className="divide-y text-sm">
            {flagged.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link
                  to="/portal/students/$id"
                  params={{ id: r.id }}
                  className="font-medium text-primary hover:underline"
                >
                  {r.name}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">{r.id}</span>
                </Link>
                <span className="flex flex-wrap gap-1.5 text-xs">
                  <span className={`rounded-full px-2 py-0.5 ${PILL[r.academicRisk]}`}>
                    Academic {r.academicRisk} ({r.academicPoints})
                  </span>
                  <span className={`rounded-full px-2 py-0.5 ${PILL[r.placementRisk]}`}>
                    Placement {r.placementRisk} ({r.placementPoints})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <Button asChild variant="link" className="mt-1 px-0">
          <Link to="/portal/monitor">Open attendance and risk monitor</Link>
        </Button>
      </div>
    </section>
  );
}
