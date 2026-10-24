import { useState } from "react";
import { AlertTriangle, Check, CircleHelp, FileSearch, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ProgressBar, SectionTitle, StatCard } from "@/components/widgets";
import { PageSkeleton, StatusPill } from "@/components/ui-kit";
import { atsReport, driveMatch, keywordMatch } from "@/lib/ats";
import { useResume } from "@/lib/use-platform";

// The ATS checker reads the resume text already stored for the student and scores it against
// fixed rules, every one of which is shown with what it found and how to fix it. It is a check
// of the resume, not a prediction: no employer's own system is being queried.

const STATE = {
  pass: { icon: Check, cls: "text-success" },
  partial: { icon: AlertTriangle, cls: "text-warning" },
  fail: { icon: X, cls: "text-destructive" },
};

const tone = (percent) =>
  percent >= 80 ? "success" : percent >= 60 ? "info" : percent >= 40 ? "warning" : "danger";
const barColor = (percent) =>
  percent >= 80
    ? "var(--success)"
    : percent >= 60
      ? "var(--info)"
      : percent >= 40
        ? "var(--warning)"
        : "var(--destructive)";

function Chips({ terms, cls }) {
  return (
    <span className="flex flex-wrap gap-1">
      {terms.map((t) => (
        <span key={t} className={`rounded-full border px-2 py-0.5 text-xs ${cls}`}>
          {t}
        </span>
      ))}
    </span>
  );
}

/** How well the stored resume matches one drive, shown on the drive's own card. */
export function DriveMatch({ drive }) {
  const { data, isLoading } = useResume();
  if (isLoading) return null;
  const hasResume = (data?.text ?? "").trim().length >= 50;
  const match = hasResume ? driveMatch(data.text, drive) : null;
  if (!match)
    return (
      <p className="mt-3 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        {hasResume
          ? "This posting names no skill this checker recognises, so there is nothing to match your resume against."
          : "Upload your resume below to see how well it matches this role."}
      </p>
    );
  return (
    <div className="mt-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase text-label">Resume match</p>
        <StatusPill tone={tone(match.percent)}>{match.percent}%</StatusPill>
      </div>
      <div className="mt-2">
        <ProgressBar value={match.percent} tone={barColor(match.percent)} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {match.matched.length} of {match.wanted.length} {match.basis}.
        {match.thin && " That is too few to read much into — go by the eligibility checklist."}
      </p>
      {match.matched.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-muted-foreground">On your resume</p>
          <Chips terms={match.matched} cls="border-success/40 text-success" />
        </div>
      )}
      {match.missing.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-muted-foreground">Asked for, not on your resume</p>
          <Chips terms={match.missing} cls="border-warning/40 text-warning" />
        </div>
      )}
    </div>
  );
}

function JobMatch() {
  const { data } = useResume();
  const [text, setText] = useState("");
  const [checked, setChecked] = useState(null);
  const resume = data?.text ?? "";
  return (
    <div className="mt-4 rounded-xl border bg-card p-4">
      <p className="text-sm font-semibold">Check against a job description</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Paste a posting to see which of its keywords your resume already carries.
      </p>
      <Textarea
        className="mt-2"
        rows={4}
        maxLength={6000}
        value={text}
        placeholder="Paste the role and requirements here"
        onChange={(e) => setText(e.target.value)}
      />
      <Button
        type="button"
        size="sm"
        className="mt-2"
        disabled={text.trim().length < 20 || resume.length < 50}
        onClick={() => setChecked(keywordMatch(resume, text.slice(0, 120), text))}
      >
        <FileSearch /> Check the match
      </Button>
      {checked &&
        (checked.percent === null ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No skills this checker knows were named in that posting, so there is nothing to compare.
            Paste the requirements section as well.
          </p>
        ) : (
          <div className="mt-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Keyword match</span>
              <span className="tabular-nums">{checked.percent}%</span>
            </div>
            <ProgressBar value={checked.percent} tone={barColor(checked.percent)} />
            {checked.missing.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground">Missing from your resume</p>
                <Chips terms={checked.missing} cls="border-warning/40 text-warning" />
              </div>
            )}
          </div>
        ))}
    </div>
  );
}

/**
 * The resume's ATS score: what an applicant tracking system can read from it, section by
 * section, with the fix for everything it loses marks on.
 */
export function AtsChecker({ s }) {
  const { data, isLoading } = useResume();
  const roles = s?.targetRoles ?? [];
  // Plain string checks over a few thousand characters: cheap enough to redo on every render.
  const report = atsReport(data?.text ?? "", { roles });
  if (isLoading) return <PageSkeleton rows={1} />;
  return (
    <section className="surface p-4" aria-label="ATS score checker">
      <SectionTitle sub="How an applicant tracking system reads your resume. Rule-based, not a prediction of selection.">
        ATS score checker
      </SectionTitle>
      {!report ? (
        <p className="text-sm text-muted-foreground">
          Upload your resume below (PDF, Word or TXT) and it is checked here straight away.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
            <StatCard
              label="ATS score"
              value={`${report.score}`}
              sub={`out of 100 · ${report.band}`}
              tone={report.score >= 80 ? "success" : report.score >= 60 ? "warning" : "danger"}
            />
            <StatCard label="Words" value={String(report.words)} sub="250–900 reads best" />
            <StatCard
              label="Sections found"
              value={`${Object.values(report.sections).filter(Boolean).length} / 5`}
            />
            <StatCard label="Skill keywords" value={String(report.terms.length)} />
          </div>
          <div className="mt-3">
            <ProgressBar value={report.score} tone={barColor(report.score)} />
          </div>
          <ul className="mt-4 space-y-2">
            {report.checks.map((c) => {
              const S = STATE[c.state];
              return (
                <li key={c.id} className="flex items-start gap-2 text-sm">
                  <S.icon className={`mt-0.5 size-4 shrink-0 ${S.cls}`} aria-hidden />
                  <span>
                    <span className="font-medium">{c.label}</span>{" "}
                    <span className="tabular-nums text-muted-foreground">
                      {c.points}/{c.max}
                    </span>
                    <span className="block text-xs text-muted-foreground">{c.detail}</span>
                    {c.state !== "pass" && <span className="block text-xs">{c.fix}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
          {report.notes.length > 0 && (
            <div className="mt-4 rounded-lg border border-warning/40 p-3">
              <p className="text-xs font-semibold uppercase text-label">Also worth fixing</p>
              <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                {report.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          )}
          {report.roleKeywords.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-semibold">Keywords for your target roles</p>
              {report.roleKeywords.map((r) => (
                <div key={r.role} className="mt-2">
                  <div className="flex justify-between text-sm">
                    <span>{r.role}</span>
                    <span className="tabular-nums">{r.percent}%</span>
                  </div>
                  <ProgressBar value={r.percent} tone={barColor(r.percent)} />
                  {r.missing.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Missing: {r.missing.join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
          <JobMatch />
          <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
            <CircleHelp className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Scored from the text read out of your resume file. A company's own system may weigh
            things differently, and a high score here is not an offer.
          </p>
        </>
      )}
    </section>
  );
}
