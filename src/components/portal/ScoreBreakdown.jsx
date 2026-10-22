import { useState } from "react";
import { CircleAlert, CircleHelp, Info } from "lucide-react";
import { BandBadge, ProgressBar, ScoreRing, SectionTitle } from "@/components/widgets";
import { academicRisk, effectiveBand, placementRisk } from "@/lib/risk-flags";
import {
  lmsParts,
  pendingAssignments,
  recommendations,
  studentAttendancePct,
  successScore,
} from "@/lib/scoring";
import { DEFAULT_WEIGHTS } from "@/lib/types";
import { FlagBadge, FlagDrivers } from "@/components/student-profile/shared";

const LABELS = {
  academics: "Academics",
  attendance: "Attendance",
  lms: "LMS",
  engagement: "Engagement",
  skills: "Skills",
  placement: "Placement readiness",
};

const num = (v, d = 0) => (v === null || v === undefined ? "—" : v.toFixed(d));
const known = (v) => (v >= 0 ? String(v) : "not assessed");
const count = (s, type) => s.engagement.filter((e) => e.type === type).length;

/** The raw facts behind one component, so the score can be checked by hand. */
function support(key, s) {
  switch (key) {
    case "academics":
      return [
        ["CGPA", s.cgpa > 0 ? s.cgpa.toFixed(2) : "not recorded"],
        ["Component = CGPA × 10", s.cgpa > 0 ? (s.cgpa * 10).toFixed(0) : "—"],
        ["Active backlogs", String(s.backlogs)],
        [
          "SGPA by semester",
          s.semesterGrades.length ? s.semesterGrades.join(" → ") : "not recorded",
        ],
        ...s.subjects.map((x) => [`Marks, ${x.subject}`, `${x.marks} / 100`]),
      ];
    case "attendance":
      return [
        ["Overall", `${num(studentAttendancePct(s), 1)}%`],
        ...s.subjects.map((x) => [
          x.subject,
          `${x.classesAttended}/${x.classesHeld} (${num(x.classesHeld ? (x.classesAttended / x.classesHeld) * 100 : null, 1)}%)`,
        ]),
      ];
    case "lms": {
      const p = lmsParts(s);
      return [
        ["Lessons completed", `${num(p.lessonsPct)}%`],
        ["Assignments submitted", `${num(p.assignmentPct)}%`],
        ["Component = mean of the two", ""],
        ["Pending assignments", String(pendingAssignments(s).length)],
        [
          "Logins per week",
          s.lmsLoginsPerWeek === undefined ? "not recorded" : s.lmsLoginsPerWeek.toFixed(1),
        ],
      ];
    }
    case "engagement":
      return [
        ["Clubs (8 points each)", String(count(s, "club"))],
        ["Events (4 each)", String(count(s, "event"))],
        ["Hackathons (12 each)", String(count(s, "hackathon"))],
        ["Certifications (10 each)", String(count(s, "certification"))],
        ["Verified activities", String(s.engagement.filter((e) => e.verified).length)],
      ];
    case "skills":
      return [
        ["Coding", known(s.skills.coding)],
        ["Aptitude", known(s.skills.aptitude)],
        ["Verbal", known(s.skills.verbal)],
        ["Communication", known(s.skills.communication)],
        ["Component = mean of assessed skills", ""],
      ];
    default:
      return [
        [
          "Resume completeness (40%)",
          s.resumeCompleteness >= 0 ? `${s.resumeCompleteness}%` : "not recorded",
        ],
        [
          "Assessments done (30%)",
          s.assessmentsRequired
            ? `${s.assessmentsCompleted}/${s.assessmentsRequired}`
            : "not recorded",
        ],
        [
          "Mock interviews (30%, 3 = full)",
          s.mockInterviews === undefined ? "not recorded" : String(s.mockInterviews),
        ],
      ];
  }
}

/** The signature view: score, band, each component, weights, contributors, and the risk rules. */
export function ScoreBreakdown({ s, title = "Success Score breakdown", you = "this student" }) {
  const r = successScore(s);
  const acad = academicRisk(s);
  const place = placementRisk(s);
  const band = r.score === null ? null : effectiveBand(r.score, r.band, acad, place);
  const present = Object.entries(r.components).filter(([, v]) => v !== null);
  const wSum = present.reduce((a, [k]) => a + DEFAULT_WEIGHTS[k], 0);
  const [selected, setSelected] = useState(present[0]?.[0] ?? "academics");
  const chosen = Object.keys(LABELS).includes(selected) ? selected : "academics";

  return (
    <section className="surface p-4 md:p-6" aria-label={title}>
      <SectionTitle sub="Calculated from configured weights and rules. It is not an AI prediction.">
        {title}
      </SectionTitle>
      <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-2 text-center">
          <ScoreRing score={r.score} size={148} />
          <p className="font-display text-lg font-bold tabular-nums">
            {r.score === null ? "No score yet" : `${Math.round(r.score)} / 100`}
          </p>
          <BandBadge score={r.score} />
          {band && band !== r.band && (
            <p className="max-w-48 text-xs text-warning">
              Shown as {band}: a High risk flag prevents "On Track".
            </p>
          )}
          <p className="max-w-48 text-xs text-muted-foreground">
            Uses {present.length} of 6 indicators.
          </p>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase text-label">
            Select an indicator to see what sits behind it
          </p>
          <ul className="space-y-2">
            {Object.entries(LABELS).map(([key, label]) => {
              const v = r.components[key];
              const missing = v === null;
              const points = missing ? null : (v * DEFAULT_WEIGHTS[key]) / wSum;
              const open = chosen === key;
              return (
                <li key={key}>
                  <button
                    type="button"
                    aria-pressed={open}
                    aria-controls="score-detail"
                    onClick={() => setSelected(key)}
                    className={`w-full rounded-lg border p-2 text-left transition-colors hover:border-[var(--border-hover)] ${open ? "border-primary bg-accent/50" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">
                        {label}{" "}
                        <span className="font-normal text-muted-foreground">
                          · weight {DEFAULT_WEIGHTS[key]}%
                          {!missing &&
                            wSum !== 100 &&
                            ` (counts as ${((DEFAULT_WEIGHTS[key] / wSum) * 100).toFixed(0)}%)`}
                        </span>
                      </span>
                      {missing ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-warning">
                          <CircleHelp className="size-3.5" aria-hidden /> Not recorded
                        </span>
                      ) : (
                        <span className="tabular-nums">
                          {v.toFixed(0)} <span className="text-muted-foreground">→</span>{" "}
                          <b>+{points.toFixed(1)} pts</b>
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5">
                      <ProgressBar value={missing ? 0 : v} />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          {r.missing.length > 0 && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Missing data is never counted as zero. The weight of{" "}
              {r.missing.map((m) => LABELS[m].toLowerCase()).join(", ")} is shared out across the
              indicators that are recorded.
            </p>
          )}
        </div>
      </div>

      <div id="score-detail" className="mt-5 rounded-lg border bg-muted/30 p-3" aria-live="polite">
        <p className="mb-2 text-sm font-semibold">
          {LABELS[chosen]}: supporting data
          {r.components[chosen] === null && (
            <span className="ml-2 text-xs font-normal text-warning">nothing recorded yet</span>
          )}
        </p>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {support(chosen, s).map(([k, v], i) => (
            <div key={k + i} className="flex justify-between gap-3 border-b border-border/50 py-1">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-medium tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <p className="mb-1 font-medium text-success">Helping {you}</p>
          {r.positives.length ? (
            r.positives.map((p) => <p key={p}>+ {p}</p>)
          ) : (
            <p className="text-muted-foreground">Nothing stands out yet</p>
          )}
        </div>
        <div>
          <p className="mb-1 font-medium text-destructive">Working against {you}</p>
          {r.negatives.length ? (
            r.negatives.map((p) => <p key={p}>− {p}</p>)
          ) : (
            <p className="text-muted-foreground">No negatives</p>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-6 border-t pt-4 sm:grid-cols-2">
        <FlagDrivers title="Academic risk" flag={acad} />
        <FlagDrivers title="Placement risk" flag={place} />
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <CircleAlert className="size-3.5" aria-hidden /> The two flags are separate rules:
        <FlagBadge label="Academic" flag={acad} />
        <FlagBadge label="Placement" flag={place} />
      </p>

      <div className="mt-4 border-t pt-4">
        <p className="mb-1 text-sm font-medium">Recommended next steps</p>
        <ul className="list-inside list-disc space-y-1 text-sm">
          {recommendations(s).map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
