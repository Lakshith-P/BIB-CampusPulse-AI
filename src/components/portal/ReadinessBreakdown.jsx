import { useState } from "react";
import { ChevronDown, TrendingDown, TrendingUp } from "lucide-react";
import { ProgressBar, SectionTitle } from "@/components/widgets";
import { ErrorState, PageSkeleton } from "@/components/ui-kit";
import { useAssessments, useMockInterviews } from "@/lib/use-platform";
import { summarizeSkills } from "@/lib/skills-insights";
import { componentScores } from "@/lib/scoring";

// Placement readiness, and the numbers under it, as buttons. Opening one says where the figure
// came from and what moved it: the tests behind a skill score, the weights behind readiness,
// the interviews that were recorded. Nothing here is estimated — a missing figure says so.

const cap = (s) => s[0].toUpperCase() + s.slice(1);
const known = (v) => (v >= 0 ? String(v) : "—");

/** One tile. It is a button, and shows a caret so it is clear more sits behind the number. */
function Tile({ label, value, sub, open, onClick }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onClick}
      className={`surface p-4 text-left transition-colors hover:border-[var(--border-hover)] ${
        open ? "ring-2 ring-ring" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </div>
      <p className="mt-2 font-display text-3xl font-bold leading-none tabular-nums">{value}</p>
      <p className="mt-2 text-xs text-muted-foreground">{sub}</p>
    </button>
  );
}

function Row({ label, value, note }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 border-t py-1.5">
      <span>{label}</span>
      <span className="tabular-nums">
        {value}
        {note && <span className="ml-2 text-xs text-muted-foreground">{note}</span>}
      </span>
    </li>
  );
}

/** The weighted parts behind the readiness percentage, exactly as the score is calculated. */
function ReadinessWhy({ s }) {
  const assessmentPct =
    s.assessmentsRequired > 0 ? (s.assessmentsCompleted / s.assessmentsRequired) * 100 : null;
  const mockPct =
    s.mockInterviews !== undefined && s.mockInterviews >= 0
      ? Math.min(100, (s.mockInterviews / 3) * 100)
      : null;
  const parts = [
    {
      label: "Resume completeness",
      weight: 40,
      value: s.resumeCompleteness >= 0 ? s.resumeCompleteness : null,
      detail: "",
    },
    {
      label: "Placement assessments done",
      weight: 30,
      value: assessmentPct,
      detail: s.assessmentsRequired ? `${s.assessmentsCompleted} of ${s.assessmentsRequired}` : "",
    },
    {
      label: "Mock interviews",
      weight: 30,
      value: mockPct,
      detail: s.mockInterviews === undefined ? "" : `${s.mockInterviews} of 3`,
    },
  ];
  const present = parts.filter((p) => p.value !== null);
  const weight = present.reduce((a, p) => a + p.weight, 0) || 1;
  return (
    <div>
      <p className="text-sm">
        Readiness is the weighted average of three recorded figures. The weights are shared out over
        whatever is recorded, so a missing figure is never counted as zero.
      </p>
      <ul className="mt-2 text-sm">
        {parts.map((part) => (
          <Row
            key={part.label}
            label={`${part.label} · weight ${part.weight}%${part.detail ? ` · ${part.detail}` : ""}`}
            value={part.value === null ? "Not recorded" : `${Math.round(part.value)}%`}
            note={
              part.value === null
                ? "not counted"
                : `adds ${((part.value * part.weight) / weight).toFixed(1)} of the 100`
            }
          />
        ))}
      </ul>
      {present.length < parts.length && (
        <p className="mt-2 text-xs text-warning">
          {parts.length - present.length} of the 3 figures are not recorded yet, so readiness is
          built from the rest.
        </p>
      )}
    </div>
  );
}

/**
 * Why a skill score stands where it does: the record keeps the mean of the three most recent
 * tests, so the drop or rise is traced back to the tests themselves.
 */
function SkillWhy({ skill, recorded, studentId }) {
  const { data, isLoading, error, refetch } = useAssessments(studentId);
  if (isLoading) return <PageSkeleton rows={1} />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const summary = summarizeSkills(data);
  const c = summary.byCategory[skill];
  const series = [...c.series].reverse();
  const counted = c.series.slice(-3);
  const weak = summary.topics.filter((t) => t.category === skill && t.avg < 50);
  if (!c.count)
    return (
      <p className="text-sm text-muted-foreground">
        No {skill} test has been recorded yet, so this score is not part of your readiness. Ask your
        teacher to schedule one.
      </p>
    );
  return (
    <div>
      <p className="text-sm">
        Your {skill} score is the average of your {counted.length} most recent test
        {counted.length === 1 ? "" : "s"} ({counted.map((t) => t.score).join(", ")}) ={" "}
        <b>{Math.round(c.current)}</b>
        {recorded >= 0 && Math.round(c.current) !== recorded && (
          <span className="text-muted-foreground"> · {recorded} on your record</span>
        )}
        .
      </p>
      {c.trend !== null && (
        <p className="mt-1 flex items-center gap-1 text-sm">
          {c.trend >= 0 ? (
            <>
              <TrendingUp className="size-4 text-success" aria-hidden />
              Up {Math.round(c.trend)} points against your three tests before these.
            </>
          ) : (
            <>
              <TrendingDown className="size-4 text-destructive" aria-hidden />
              Down {Math.round(-c.trend)} points against your three tests before these — the earlier
              tests scored higher, so the average fell.
            </>
          )}
        </p>
      )}
      <p className="mt-3 text-xs font-semibold uppercase text-label">
        Every recorded {skill} test, newest first
      </p>
      <ul className="mt-1 text-sm">
        {series.map((t, i) => {
          const previous = series[i + 1];
          const change = previous ? t.score - previous.score : null;
          const inAverage = counted.some((x) => x.date === t.date && x.score === t.score);
          return (
            <Row
              key={`${t.date}-${t.topic}-${t.score}`}
              label={`${t.date}${t.topic ? ` · ${t.topic}` : ""}${inAverage ? " · in your current average" : ""}`}
              value={`${t.score}/100`}
              note={
                change === null
                  ? "first test"
                  : change === 0
                    ? "same as the test before"
                    : `${change > 0 ? "+" : ""}${change} vs the test before`
              }
            />
          );
        })}
      </ul>
      {weak.length > 0 && (
        <p className="mt-2 text-sm">
          Weakest topics pulling the score down:{" "}
          {weak.map((t) => `${t.topic} (${Math.round(t.avg)})`).join(", ")}.
        </p>
      )}
    </div>
  );
}

/** The mock interviews on record, which count for 30% of readiness until three are done. */
function MockWhy({ s, studentId }) {
  const { data, isLoading, error, refetch } = useMockInterviews(studentId);
  if (isLoading) return <PageSkeleton rows={1} />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const done = s.mockInterviews ?? data.length;
  return (
    <div>
      <p className="text-sm">
        Three interviews count as the full 30% of readiness. You have {done}, which counts as{" "}
        <b>{Math.round(Math.min(100, (done / 3) * 100))}%</b> of that part.
      </p>
      {!data.length ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing recorded yet. A teacher records an interview, or you can practise one from the AI
          mock interview panel below.
        </p>
      ) : (
        <ul className="mt-2 text-sm">
          {data.map((m) => (
            <Row
              key={m.id}
              label={`${m.interview_date}${m.interviewer ? ` · ${m.interviewer}` : ""}`}
              value={m.score === null ? "not scored" : `${m.score}/100`}
              note={m.feedback || undefined}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function AssessmentsWhy({ s }) {
  if (!s.assessmentsRequired)
    return (
      <p className="text-sm text-muted-foreground">
        No placement assessments have been set for you yet, so this part is not counted.
      </p>
    );
  const pct = (s.assessmentsCompleted / s.assessmentsRequired) * 100;
  return (
    <div>
      <p className="text-sm">
        {s.assessmentsCompleted} of {s.assessmentsRequired} placement assessments are done ={" "}
        <b>{Math.round(pct)}%</b> of this part, which carries 30% of readiness.
      </p>
      <div className="mt-2 max-w-sm">
        <ProgressBar value={pct} />
      </div>
      {s.assessmentsCompleted < s.assessmentsRequired && (
        <p className="mt-2 text-sm">
          Finishing the remaining {s.assessmentsRequired - s.assessmentsCompleted} would add about{" "}
          {Math.round((100 - pct) * 0.3)} points to your readiness.
        </p>
      )}
    </div>
  );
}

/**
 * The readiness row on the placement page. Each figure opens to say why it stands where it does,
 * including the earlier tests behind a skill score that has fallen.
 */
export function ReadinessBreakdown({ s, canOpen = true }) {
  const studentId = s.id;
  const [open, setOpen] = useState(null);
  const readiness = componentScores(s).placement;
  const tiles = [
    {
      key: "readiness",
      label: "Placement readiness",
      value: readiness === null ? "—" : Math.round(readiness),
      sub: readiness === null ? "not enough recorded yet" : "of 100 · why?",
      panel: <ReadinessWhy s={s} />,
      title: "How placement readiness is worked out",
    },
    {
      key: "aptitude",
      label: "Aptitude",
      value: known(s.skills.aptitude),
      sub: "average of your last 3 tests · why?",
      panel: <SkillWhy skill="aptitude" recorded={s.skills.aptitude} studentId={studentId} />,
      title: "Behind your aptitude score",
    },
    {
      key: "coding",
      label: "Coding",
      value: known(s.skills.coding),
      sub: "average of your last 3 tests · why?",
      panel: <SkillWhy skill="coding" recorded={s.skills.coding} studentId={studentId} />,
      title: "Behind your coding score",
    },
    {
      key: "mock",
      label: "Mock interviews",
      value: s.mockInterviews === undefined ? "—" : String(s.mockInterviews),
      sub: "3 count in full · why?",
      panel: <MockWhy s={s} studentId={studentId} />,
      title: "The interviews on your record",
    },
    {
      key: "assessments",
      label: "Assessments done",
      value: s.assessmentsRequired ? `${s.assessmentsCompleted} / ${s.assessmentsRequired}` : "—",
      sub: "placement assessments · why?",
      panel: <AssessmentsWhy s={s} />,
      title: "Your placement assessments",
    },
  ];
  const current = tiles.find((t) => t.key === open);
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {tiles.map((t) =>
          canOpen ? (
            <Tile
              key={t.key}
              label={t.label}
              value={t.value}
              sub={t.sub}
              open={open === t.key}
              onClick={() => setOpen(open === t.key ? null : t.key)}
            />
          ) : (
            <div key={t.key} className="surface p-4">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t.label}
              </span>
              <p className="mt-2 font-display text-3xl font-bold leading-none tabular-nums">
                {t.value}
              </p>
            </div>
          ),
        )}
      </div>
      {current && (
        <section className="surface mt-3 p-4" aria-label={current.title}>
          <SectionTitle sub="From your own recorded data and the configured rules">
            {current.title}
          </SectionTitle>
          {current.panel}
        </section>
      )}
    </div>
  );
}
