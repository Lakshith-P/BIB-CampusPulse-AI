import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, CircleHelp, ExternalLink, Plus, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ProgressBar, SectionTitle } from "@/components/widgets";
import {
  ConfirmDialog,
  ErrorState,
  Field,
  PageSkeleton,
  StatusPill,
  inputClass,
  useAction,
} from "@/components/ui-kit";
import {
  applyDrive,
  loadApplicants,
  logMockInterview,
  moveApplication,
  postDrive,
  removeDrive,
  removeMockInterview,
} from "@/lib/platform.functions";
import { roleMatch } from "@/lib/role-match";
import { todayIso } from "@/lib/live-profile";
import { useDrives, useMockInterviews, useRefreshAll } from "@/lib/use-platform";
import { MockInterviewHub } from "@/components/portal/InterviewPages";
import { AtsChecker, DriveMatch } from "@/components/portal/AtsChecker";
import { useCampus } from "@/lib/use-campus";

const RESULT = {
  Pass: { icon: CheckCircle2, cls: "text-success", label: "Passed" },
  Fail: { icon: XCircle, cls: "text-destructive", label: "Not met" },
  Unknown: { icon: CircleHelp, cls: "text-warning", label: "Unknown" },
};

/** The checklist behind "can I apply?": every criterion, with Passed, Not met or Unknown. */
export function EligibilityChecklist({ eligibility }) {
  if (!eligibility)
    return (
      <p className="text-sm text-muted-foreground">
        Eligibility cannot be checked until your record is complete.
      </p>
    );
  return (
    <div>
      <ul className="space-y-1.5">
        {eligibility.criteria.map((c) => {
          const R = RESULT[c.result];
          return (
            <li key={c.label} className="flex items-start gap-2 text-sm">
              <R.icon className={`mt-0.5 size-4 shrink-0 ${R.cls}`} aria-hidden />
              <span>
                <span className={`font-medium ${R.cls}`}>{R.label}</span>
                {" · "}
                {c.label}
                <span className="block text-xs text-muted-foreground">{c.detail}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">{eligibility.explanation}</p>
    </div>
  );
}

const APPLICATION_TONE = {
  applied: "info",
  shortlisted: "warning",
  selected: "success",
  rejected: "danger",
};

function DriveCard({ drive, refresh }) {
  const { busy, run } = useAction(refresh);
  const eligible = drive.eligibility?.eligible;
  return (
    <article className="surface p-4" aria-label={`${drive.company}, ${drive.roleTitle}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-numeric text-lg font-semibold">{drive.company}</h3>
          <p className="text-sm text-muted-foreground">
            {drive.roleTitle}
            {drive.package && ` · ${drive.package}`}
          </p>
        </div>
        {drive.application ? (
          <StatusPill tone={APPLICATION_TONE[drive.application]}>
            {drive.application[0].toUpperCase() + drive.application.slice(1)}
          </StatusPill>
        ) : !drive.open ? (
          <StatusPill tone="neutral">Closed</StatusPill>
        ) : eligible ? (
          <StatusPill tone="success">You are eligible</StatusPill>
        ) : (
          <StatusPill tone="warning">Not eligible yet</StatusPill>
        )}
      </div>
      {drive.description && <p className="mt-2 text-sm">{drive.description}</p>}
      <p className="mt-2 text-xs text-muted-foreground">
        Apply by {drive.deadline}
        {drive.driveDate && ` · Drive on ${drive.driveDate}`}
      </p>
      <div className="mt-3 rounded-lg border p-3">
        <p className="mb-2 text-xs font-semibold uppercase text-label">Eligibility checklist</p>
        <EligibilityChecklist eligibility={drive.eligibility} />
      </div>
      <DriveMatch drive={drive} />
      <div className="mt-3 flex flex-wrap gap-2">
        {drive.open && !drive.application && (
          <Button
            type="button"
            size="sm"
            disabled={busy || !eligible}
            onClick={() =>
              run(() => applyDrive({ data: { driveId: drive.id } }), "Application sent.")
            }
          >
            Apply now
          </Button>
        )}
        {drive.link && (
          <Button asChild size="sm" variant="outline">
            <a href={drive.link}>
              <ExternalLink /> Company page
            </a>
          </Button>
        )}
      </div>
    </article>
  );
}

function RoleMatch({ s }) {
  const roles = s.targetRoles ?? [];
  if (!roles.length)
    return (
      <p className="text-sm text-muted-foreground">
        Choose up to five target roles on your{" "}
        <Link to="/portal/profile" className="text-primary underline">
          profile
        </Link>{" "}
        to see how your skills compare.
      </p>
    );
  return (
    <div className="space-y-4">
      {roles.map((role) => {
        const r = roleMatch(s.skills, role);
        if (!r)
          return (
            <div key={role} className="text-sm">
              <p className="font-medium">{role}</p>
              <p className="text-muted-foreground">
                No skill profile is configured for this role yet, so no match is shown.
              </p>
            </div>
          );
        return (
          <div key={role}>
            <div className="flex justify-between text-sm">
              <span className="font-medium">{r.role}</span>
              <span className="tabular-nums">
                {r.match === null ? "Not assessed" : `${r.match}% match`}
              </span>
            </div>
            <ProgressBar value={r.match ?? 0} />
            {r.gaps.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                {r.gaps.map((g) => (
                  <li key={g.skill}>
                    Skill gap: <b className="text-foreground">{g.skill}</b> {g.value}/{g.required}{" "}
                    needed (improve by {g.gap})
                  </li>
                ))}
              </ul>
            )}
            {r.unknown.length > 0 && (
              <p className="mt-1 text-xs text-warning">Not assessed yet: {r.unknown.join(", ")}</p>
            )}
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">
        Rule-based comparison with typical skill levels per role, not a prediction of selection.
      </p>
    </div>
  );
}

function MockList({ studentId, canEdit }) {
  const { data, isLoading, error, refetch } = useMockInterviews(studentId);
  const refresh = useRefreshAll();
  const { run } = useAction(refresh);
  const [removing, setRemoving] = useState(null);
  if (isLoading) return <PageSkeleton rows={1} />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data.length)
    return <p className="text-sm text-muted-foreground">No mock interviews recorded yet.</p>;
  return (
    <ul className="divide-y">
      {data.map((m) => (
        <li key={m.id} className="flex items-start justify-between gap-3 py-2 text-sm">
          <div>
            <p className="font-medium">
              {m.interview_date}
              {m.interviewer && ` · ${m.interviewer}`}
              {m.score !== null && <span className="ml-2 tabular-nums">{m.score}/100</span>}
            </p>
            {m.feedback && <p className="text-muted-foreground">{m.feedback}</p>}
          </div>
          {canEdit && (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Remove interview"
              onClick={() => setRemoving(m)}
            >
              <Trash2 />
            </Button>
          )}
        </li>
      ))}
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(v) => !v && setRemoving(null)}
        title="Remove this mock interview?"
        description="The interview count used in the placement score goes down by one."
        confirmLabel="Remove"
        onConfirm={() =>
          run(() => removeMockInterview({ data: { id: removing.id } }), "Interview removed.")
        }
      />
    </ul>
  );
}

// ---------------------------------------------------------------- student
export function StudentDrives({ s }) {
  const { data, isLoading, error, refetch } = useDrives();
  const refresh = useRefreshAll();
  return (
    <div className="space-y-6">
      <section>
        <SectionTitle sub="Each drive is checked against your own record. Nothing is assumed.">
          Placement drives
        </SectionTitle>
        {isLoading ? (
          <PageSkeleton rows={2} />
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : !data.length ? (
          <EmptyState
            title="No drives posted yet"
            hint="Your placement cell posts drives here with their criteria."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {data.map((d) => (
              <DriveCard key={d.id} drive={d} refresh={refresh} />
            ))}
          </div>
        )}
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="surface p-4">
          <SectionTitle sub="Compared with typical skill levels for your target roles">
            Role match and skill gaps
          </SectionTitle>
          <RoleMatch s={s} />
        </section>
        <section className="surface p-4">
          <SectionTitle sub="Recorded by your teachers and your AI practice interviews">
            Mock interview record
          </SectionTitle>
          <MockList canEdit={false} />
        </section>
      </div>
      <AtsChecker s={s} />
      <MockInterviewHub />
    </div>
  );
}

// ---------------------------------------------------------------- teacher
function DriveForm({ onDone }) {
  const empty = {
    company: "",
    roleTitle: "",
    description: "",
    package: "",
    driveDate: "",
    deadline: "",
    minCgpa: "6",
    maxBacklogs: "0",
    branches: "",
    gradYear: "",
    requiresAssessment: false,
    link: "",
  };
  const [f, setF] = useState(empty);
  const { busy, run } = useAction(onDone);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await run(
          () =>
            postDrive({
              data: {
                ...f,
                minCgpa: Number(f.minCgpa),
                maxBacklogs: Number(f.maxBacklogs),
                branches: f.branches
                  .split(",")
                  .map((b) => b.trim())
                  .filter(Boolean),
                gradYear: f.gradYear ? Number(f.gradYear) : null,
              },
            }),
          "Drive posted. Eligible students were notified.",
        );
        if (r.ok) setF(empty);
      }}
    >
      <Field label="Company">
        <Input value={f.company} onChange={set("company")} required minLength={2} maxLength={100} />
      </Field>
      <Field label="Role">
        <Input
          value={f.roleTitle}
          onChange={set("roleTitle")}
          required
          minLength={2}
          maxLength={100}
        />
      </Field>
      <Field label="Package (optional)">
        <Input
          value={f.package}
          onChange={set("package")}
          maxLength={60}
          placeholder="e.g. 8 LPA"
        />
      </Field>
      <Field label="Apply by">
        <Input type="date" value={f.deadline} onChange={set("deadline")} required />
      </Field>
      <Field label="Drive date (optional)">
        <Input type="date" value={f.driveDate} onChange={set("driveDate")} />
      </Field>
      <Field label="Company link (https://, optional)">
        <Input type="url" value={f.link} onChange={set("link")} placeholder="https://" />
      </Field>
      <Field label="Minimum CGPA">
        <Input
          type="number"
          min={0}
          max={10}
          step="0.1"
          value={f.minCgpa}
          onChange={set("minCgpa")}
          required
        />
      </Field>
      <Field label="Maximum active backlogs">
        <Input
          type="number"
          min={0}
          max={50}
          value={f.maxBacklogs}
          onChange={set("maxBacklogs")}
          required
        />
      </Field>
      <Field label="Graduation year (blank = any)">
        <Input type="number" min={2020} max={2040} value={f.gradYear} onChange={set("gradYear")} />
      </Field>
      <Field label="Branches (comma separated, blank = all)">
        <Input value={f.branches} onChange={set("branches")} placeholder="CSE, IT" />
      </Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input
          type="checkbox"
          checked={f.requiresAssessment}
          onChange={(e) => setF({ ...f, requiresAssessment: e.target.checked })}
          className="size-4 accent-[var(--primary)]"
        />
        Requires all placement assessments to be completed
      </label>
      <div className="sm:col-span-2 lg:col-span-3">
        <Field label="Description (optional)">
          <Textarea value={f.description} onChange={set("description")} rows={2} maxLength={2000} />
        </Field>
      </div>
      <div>
        <Button type="submit" disabled={busy}>
          <Plus /> Post drive
        </Button>
      </div>
    </form>
  );
}

function Applicants({ drive, onChanged }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const load = async () => {
    try {
      setRows(await loadApplicants({ data: { driveId: drive.id } }));
    } catch (e) {
      setError(e);
    }
  };
  const { busy, run } = useAction(async () => {
    await load();
    await onChanged();
  });
  const [opened, setOpened] = useState(false);
  if (!opened)
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          setOpened(true);
          load();
        }}
      >
        View applicants ({drive.stats.applicants})
      </Button>
    );
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!rows) return <PageSkeleton rows={1} />;
  return (
    <div className="mt-2 w-full overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th className="p-2">Student</th>
            <th>Branch</th>
            <th>CGPA</th>
            <th>Stage</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.student_id} className="border-t">
              <td className="p-2">
                <Link
                  to="/portal/students/$id"
                  params={{ id: a.student_id }}
                  className="text-primary hover:underline"
                >
                  {a.name}
                </Link>
              </td>
              <td>{a.branch}</td>
              <td className="tabular-nums">{a.cgpa}</td>
              <td>
                <select
                  value={a.status}
                  disabled={busy}
                  aria-label={`Stage for ${a.name}`}
                  className={inputClass + " w-auto"}
                  onChange={(e) =>
                    run(
                      () =>
                        moveApplication({
                          data: {
                            driveId: drive.id,
                            studentId: a.student_id,
                            status: e.target.value,
                          },
                        }),
                      "Stage updated.",
                    )
                  }
                >
                  {["applied", "shortlisted", "selected", "rejected"].map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={4} className="p-3 text-muted-foreground">
                No applicants from your students yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function MockInterviewForm({ rows, onDone }) {
  const [f, setF] = useState({
    studentId: "",
    date: todayIso(),
    interviewer: "",
    score: "",
    feedback: "",
  });
  const { busy, run } = useAction(onDone);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <form
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await run(
            () =>
              logMockInterview({
                data: { ...f, score: f.score === "" ? null : Number(f.score) },
              }),
            "Mock interview recorded.",
          );
          if (r.ok) setF({ ...f, interviewer: "", score: "", feedback: "" });
        }}
      >
        <Field label="Student">
          <select value={f.studentId} onChange={set("studentId")} required className={inputClass}>
            <option value="">Choose a student</option>
            {rows.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.id})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <Input type="date" value={f.date} onChange={set("date")} required />
        </Field>
        <Field label="Interviewer (optional)">
          <Input value={f.interviewer} onChange={set("interviewer")} maxLength={100} />
        </Field>
        <Field label="Score out of 100 (optional)">
          <Input type="number" min={0} max={100} value={f.score} onChange={set("score")} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Feedback">
            <Input value={f.feedback} onChange={set("feedback")} maxLength={1000} />
          </Field>
        </div>
        <div>
          <Button type="submit" disabled={busy || !f.studentId}>
            <Plus /> Record interview
          </Button>
        </div>
      </form>
      {f.studentId && (
        <div className="mt-4">
          <p className="mb-1 text-xs font-semibold uppercase text-label">
            Interviews for this student
          </p>
          <MockList studentId={f.studentId} canEdit />
        </div>
      )}
    </>
  );
}

export function StaffDrives() {
  const { rows } = useCampus();
  const { data, isLoading, error, refetch } = useDrives();
  const refresh = useRefreshAll();
  const { run } = useAction(refresh);
  const [removing, setRemoving] = useState(null);
  return (
    <div className="space-y-6">
      <section className="surface p-4">
        <SectionTitle sub="Set the criteria once; every student sees their own eligibility checklist">
          Post a placement drive
        </SectionTitle>
        <DriveForm onDone={refresh} />
      </section>
      <section>
        <SectionTitle>Drives and applicants</SectionTitle>
        {isLoading ? (
          <PageSkeleton rows={2} />
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : !data.length ? (
          <EmptyState title="No drives yet" hint="Post the first one above." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {data.map((d) => (
              <article key={d.id} className="surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-numeric text-lg font-semibold">{d.company}</h3>
                    <p className="text-sm text-muted-foreground">
                      {d.roleTitle} · apply by {d.deadline}
                    </p>
                  </div>
                  <StatusPill tone={d.open ? "success" : "neutral"}>
                    {d.open ? "Open" : "Closed"}
                  </StatusPill>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  CGPA ≥ {d.minCgpa} · backlogs ≤ {d.maxBacklogs} ·{" "}
                  {d.branches.length ? d.branches.join("/") : "all branches"}
                  {d.gradYear && ` · batch ${d.gradYear}`}
                  {d.requiresAssessment && " · assessments required"}
                </p>
                <p className="mt-2 text-sm">
                  {d.stats.applicants} applied · {d.stats.shortlisted} shortlisted ·{" "}
                  {d.stats.selected} selected
                </p>
                <div className="mt-2 flex flex-wrap items-start gap-2">
                  <Applicants drive={d} onChanged={refresh} />
                  <Button type="button" size="sm" variant="ghost" onClick={() => setRemoving(d)}>
                    <Trash2 /> Remove
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="surface p-4">
        <SectionTitle sub="The count feeds each student's placement readiness">
          Mock interviews
        </SectionTitle>
        <MockInterviewForm rows={rows} onDone={refresh} />
      </section>
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(v) => !v && setRemoving(null)}
        title={`Remove the ${removing?.company ?? ""} drive?`}
        description="Applications to it are deleted as well. This cannot be undone."
        confirmLabel="Remove drive"
        onConfirm={() => run(() => removeDrive({ data: { id: removing.id } }), "Drive removed.")}
      />
    </div>
  );
}
