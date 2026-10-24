import { useEffect, useState } from "react";
import {
  CalendarClock,
  Download,
  ExternalLink,
  FileText,
  Link2,
  NotebookText,
  PlayCircle,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { EmptyState, ProgressBar, SectionTitle, StatCard } from "@/components/widgets";
import {
  ConfirmDialog,
  DownloadButton,
  ErrorState,
  Field,
  FileField,
  PageSkeleton,
  StatusPill,
  inputClass,
  useAction,
} from "@/components/ui-kit";
import { PageTitle, RoleGate } from "@/components/portal/PortalShell";
import { StaffCategory } from "@/components/portal/CategoryView";
import {
  downloadLmsFile,
  gradeLmsSubmission,
  loadSubmissions,
  removeLmsAssignment,
  removeLmsMaterial,
  saveLmsAssignment,
  saveLmsUnit,
  addLmsMaterial,
  setLmsLesson,
  submitLmsAssignment,
} from "@/lib/platform.functions";
import { todayIso } from "@/lib/live-profile";
import { useLms, useRefreshAll } from "@/lib/use-platform";
import { useCampus } from "@/lib/use-campus";
import { SyllabusDownload, SyllabusForm, SyllabusView } from "@/components/portal/SyllabusPanel";

const KIND = {
  note: { icon: NotebookText, label: "Note" },
  video: { icon: PlayCircle, label: "Video" },
  link: { icon: Link2, label: "Link" },
  file: { icon: FileText, label: "File" },
};

const daysUntil = (iso) =>
  Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${todayIso()}T00:00:00Z`)) / 86400000);

/** What a student sees for one unit's assignment, as a label plus the reason behind it. */
export function assignmentState(a) {
  const sub = a.submission;
  if (sub?.graded_at)
    return {
      tone: "success",
      label: "Graded",
      detail: `${Number(sub.marks)} / ${a.max_marks} marks`,
    };
  if (sub) {
    const late = sub.submitted_at.slice(0, 10) > a.due_on;
    return {
      tone: late ? "warning" : "info",
      label: late ? "Submitted late" : "Submitted",
      detail: "Waiting for your teacher to grade it.",
    };
  }
  const left = daysUntil(a.due_on);
  if (left < 0) return { tone: "danger", label: "Overdue", detail: `Was due ${-left} day(s) ago.` };
  if (left <= 3)
    return {
      tone: "warning",
      label: "Due soon",
      detail: left === 0 ? "Due today." : `Closes in ${left} day(s).`,
    };
  return { tone: "neutral", label: "Pending", detail: `Due in ${left} days.` };
}

// ---------------------------------------------------------------- student
function Material({ m, onToggle, busy }) {
  const K = KIND[m.kind];
  return (
    <li className="flex flex-wrap items-center gap-3 py-2 text-sm">
      <input
        type="checkbox"
        aria-label={`Mark "${m.title}" as completed`}
        checked={m.completed}
        disabled={busy}
        onChange={(e) => onToggle(m, e.target.checked)}
        className="size-4 accent-[var(--primary)]"
      />
      <K.icon className="size-4 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={m.completed ? "text-muted-foreground line-through" : "font-medium"}>
          {m.title} <span className="text-xs font-normal text-muted-foreground">· {K.label}</span>
        </p>
        {m.description && <p className="text-xs text-muted-foreground">{m.description}</p>}
      </div>
      {m.url && (
        <Button asChild size="sm" variant="outline">
          <a href={m.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink /> Open
          </a>
        </Button>
      )}
      {m.hasFile && (
        <DownloadButton
          label="Download"
          onFetch={() => downloadLmsFile({ data: { kind: "material", id: m.id } })}
        />
      )}
    </li>
  );
}

function SubmitForm({ assignment, onDone }) {
  const sub = assignment.submission;
  const [answer, setAnswer] = useState(sub?.answer ?? "");
  const [file, setFile] = useState(null);
  const { busy, run } = useAction(onDone);
  const locked = Boolean(sub?.graded_at);
  if (locked) return null;
  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await run(
          () =>
            submitLmsAssignment({
              data: { assignmentId: assignment.id, answer, file: file ?? undefined },
            }),
          sub ? "Submission updated." : "Assignment submitted.",
        );
        if (r.ok) setFile(null);
      }}
    >
      <Textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={3}
        maxLength={5000}
        aria-label="Your answer"
        placeholder="Write your answer here, or attach a file"
      />
      <FileField value={file} onChange={setFile} disabled={busy} />
      {sub?.file_name && !file && (
        <p className="text-xs text-muted-foreground">Current file: {sub.file_name}</p>
      )}
      <Button type="submit" size="sm" disabled={busy}>
        <Upload /> {sub ? "Resubmit" : "Submit assignment"}
      </Button>
    </form>
  );
}

function StudentUnit({ u, subject, syllabus, refresh, filter }) {
  const { busy, run } = useAction(refresh);
  const done = u.materials.filter((m) => m.completed).length;
  const a = u.assignment;
  const state = a ? assignmentState(a) : null;
  if (filter === "pending" && !(a && !a.submission)) return null;
  if (filter === "overdue" && !(state && state.label === "Overdue")) return null;
  if (filter === "done" && !(a?.submission || (u.materials.length && done === u.materials.length)))
    return null;
  return (
    <section className="surface p-4" aria-label={`Unit ${u.unit}: ${u.title}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase text-label">Unit {u.unit}</p>
          <h3 className="font-numeric text-lg font-semibold">{u.title}</h3>
          {u.topics && <p className="mt-1 text-sm text-muted-foreground">Syllabus: {u.topics}</p>}
        </div>
        {u.materials.length > 0 && (
          <div className="w-32 text-xs text-muted-foreground">
            {done}/{u.materials.length} lessons
            <ProgressBar value={(done / u.materials.length) * 100} />
          </div>
        )}
      </div>
      <div className="mt-2">
        <SyllabusDownload
          subject={subject}
          units={[u]}
          unit={u}
          syllabus={syllabus}
          label="Download this unit (PDF)"
        />
      </div>
      {u.materials.length ? (
        <ul className="mt-2 divide-y">
          {u.materials.map((m) => (
            <Material
              key={m.id}
              m={m}
              busy={busy}
              onToggle={(mat, value) =>
                run(() => setLmsLesson({ data: { materialId: mat.id, done: value } }))
              }
            />
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Your teacher has not uploaded learning material for this unit yet.
        </p>
      )}
      {a && (
        <div className="mt-3 rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{a.title}</p>
            <StatusPill tone={state.tone}>{state.label}</StatusPill>
          </div>
          {a.instructions && <p className="mt-1 text-sm text-muted-foreground">{a.instructions}</p>}
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3.5" /> Assigned {a.assigned_on} · Due {a.due_on}
            </span>
            <span>Max marks {a.max_marks}</span>
            <span>{state.detail}</span>
          </p>
          {a.submission?.remarks && (
            <p className="mt-2 rounded-md bg-accent p-2 text-sm text-accent-foreground">
              Teacher remark: {a.submission.remarks}
            </p>
          )}
          <SubmitForm key={a.submission?.submitted_at ?? "new"} assignment={a} onDone={refresh} />
        </div>
      )}
    </section>
  );
}

function StudentLms() {
  const { data, isLoading, error, refetch } = useLms();
  const refresh = useRefreshAll();
  const [subject, setSubject] = useState("");
  const [filter, setFilter] = useState("all");
  if (isLoading) return <PageSkeleton />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data.subjects.length)
    return (
      <EmptyState
        title="No subjects yet"
        hint="Your subjects appear here once your teacher records them. LMS content is added per subject."
      />
    );
  const current = data.subjects.find((s) => s.subject === subject) ?? data.subjects[0];
  const filters = [
    ["all", "All"],
    ["pending", "Pending work"],
    ["overdue", "Overdue"],
    ["done", "Completed"],
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
        <StatCard label="Logins this week" value={String(data.activity.week)} />
        <StatCard label="Logins in 30 days" value={String(data.activity.month)} />
        <StatCard
          label="Logins per week"
          value={data.activity.perWeek.toFixed(1)}
          sub="30-day average"
        />
        <StatCard
          label="Last sign-in"
          value={
            data.activity.lastLogin ? new Date(data.activity.lastLogin).toLocaleDateString() : "—"
          }
        />
      </div>
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Subjects">
        {data.subjects.map((s) => (
          <Button
            key={s.subject}
            type="button"
            role="tab"
            aria-selected={s.subject === current.subject}
            size="sm"
            variant={s.subject === current.subject ? "default" : "outline"}
            onClick={() => setSubject(s.subject)}
          >
            {s.subject}
          </Button>
        ))}
        <span className="mx-2 hidden h-5 w-px bg-border sm:block" />
        {filters.map(([key, label]) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={filter === key ? "secondary" : "ghost"}
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {label}
          </Button>
        ))}
      </div>
      <SyllabusView subject={current.subject} units={current.units} syllabus={current.syllabus} />
      <div className="grid gap-4 lg:grid-cols-2">
        {current.units.map((u) => (
          <StudentUnit
            key={u.unit}
            u={u}
            subject={current.subject}
            syllabus={current.syllabus}
            refresh={refresh}
            filter={filter}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- teacher
function UnitForm({ subject, unit, refresh }) {
  const [title, setTitle] = useState(unit.configured ? unit.title : "");
  const [topics, setTopics] = useState(unit.topics);
  const { busy, run } = useAction(refresh);
  return (
    <form
      className="grid gap-2 sm:grid-cols-[1fr_2fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => saveLmsUnit({ data: { subject, unit: unit.unit, title, topics } }),
          "Unit saved.",
        );
      }}
    >
      <Field label="Unit title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
      </Field>
      <Field label="Syllabus topics">
        <Input value={topics} onChange={(e) => setTopics(e.target.value)} maxLength={1000} />
      </Field>
      <Button type="submit" size="sm" disabled={busy}>
        Save unit
      </Button>
    </form>
  );
}

function MaterialForm({ subject, unit, refresh }) {
  const empty = { kind: "link", title: "", description: "", url: "" };
  const [f, setF] = useState(empty);
  const [file, setFile] = useState(null);
  const { busy, run } = useAction(refresh);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="mt-3 grid gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await run(
          () =>
            addLmsMaterial({
              data: {
                subject,
                unit,
                ...f,
                file: f.kind === "file" ? (file ?? undefined) : undefined,
              },
            }),
          "Material added.",
        );
        if (r.ok) {
          setF(empty);
          setFile(null);
        }
      }}
    >
      <Field label="Type">
        <select value={f.kind} onChange={set("kind")} className={inputClass}>
          <option value="link">Web link</option>
          <option value="video">Video link</option>
          <option value="note">Note</option>
          <option value="file">Upload a file</option>
        </select>
      </Field>
      <Field label="Title">
        <Input value={f.title} onChange={set("title")} required minLength={2} maxLength={150} />
      </Field>
      {(f.kind === "link" || f.kind === "video") && (
        <Field label="Link (https://)">
          <Input value={f.url} onChange={set("url")} required type="url" placeholder="https://" />
        </Field>
      )}
      {f.kind === "file" && (
        <div className="self-end">
          <FileField value={file} onChange={setFile} label="File" disabled={busy} />
        </div>
      )}
      <Field label="Short description (optional)">
        <Input value={f.description} onChange={set("description")} maxLength={1000} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" disabled={busy || (f.kind === "file" && !file)}>
          <Upload /> Add to Unit {unit}
        </Button>
      </div>
    </form>
  );
}

function AssignmentForm({ subject, unit, assignment, refresh, onReview }) {
  const [f, setF] = useState({
    title: assignment?.title ?? "",
    instructions: assignment?.instructions ?? "",
    dueOn: assignment?.due_on ?? "",
    maxMarks: assignment?.max_marks ?? 10,
  });
  const [removing, setRemoving] = useState(false);
  const { busy, run } = useAction(refresh);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="mt-3 rounded-lg border p-3">
      <form
        className="grid gap-2 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () =>
              saveLmsAssignment({
                data: { subject, unit, ...f, maxMarks: Number(f.maxMarks) },
              }),
            assignment ? "Assignment updated." : "Assignment published to students.",
          );
        }}
      >
        <Field label={assignment ? "Assignment title" : "New assignment title"}>
          <Input value={f.title} onChange={set("title")} required minLength={2} maxLength={150} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Due date">
            <Input type="date" value={f.dueOn} onChange={set("dueOn")} required />
          </Field>
          <Field label="Max marks">
            <Input
              type="number"
              min={1}
              max={1000}
              value={f.maxMarks}
              onChange={set("maxMarks")}
              required
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Instructions">
            <Textarea
              value={f.instructions}
              onChange={set("instructions")}
              rows={2}
              maxLength={2000}
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" size="sm" disabled={busy}>
            {assignment ? "Update assignment" : "Publish assignment"}
          </Button>
          {assignment && (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onReview(assignment)}
              >
                Review submissions ({assignment.stats?.submitted ?? 0})
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setRemoving(true)}>
                <Trash2 /> Remove
              </Button>
            </>
          )}
        </div>
      </form>
      {assignment && (
        <ConfirmDialog
          open={removing}
          onOpenChange={setRemoving}
          title="Remove this assignment?"
          description="Students' submissions and marks for it are deleted too. This cannot be undone."
          confirmLabel="Remove assignment"
          onConfirm={() =>
            run(() => removeLmsAssignment({ data: { id: assignment.id } }), "Assignment removed.")
          }
        />
      )}
    </div>
  );
}

function GradeRow({ row, assignment, onChanged }) {
  const [marks, setMarks] = useState(row.marks ?? "");
  const [remarks, setRemarks] = useState(row.remarks ?? "");
  const { busy, run } = useAction(onChanged);
  if (!row.submission_id)
    return (
      <tr className="border-t">
        <td className="p-2">{row.name}</td>
        <td colSpan={3} className="text-muted-foreground">
          Not submitted yet
        </td>
      </tr>
    );
  return (
    <tr className="border-t align-top">
      <td className="p-2 font-medium">
        {row.name}
        <span className="block text-xs font-normal text-muted-foreground">
          {new Date(row.submitted_at).toLocaleString()}
          {row.late && " · late"}
        </span>
      </td>
      <td className="max-w-xs p-2 text-sm">
        {row.answer && <p className="whitespace-pre-wrap">{row.answer}</p>}
        {row.file_name && (
          <DownloadButton
            label={row.file_name}
            onFetch={() => downloadLmsFile({ data: { kind: "submission", id: row.submission_id } })}
          />
        )}
      </td>
      <td className="p-2">
        <Input
          type="number"
          min={0}
          max={assignment.max_marks}
          step="0.5"
          value={marks}
          onChange={(e) => setMarks(e.target.value)}
          aria-label={`Marks for ${row.name} out of ${assignment.max_marks}`}
          className="w-24"
        />
      </td>
      <td className="p-2">
        <div className="flex gap-2">
          <Input
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            maxLength={1000}
            placeholder="Remark"
            aria-label={`Remark for ${row.name}`}
          />
          <Button
            type="button"
            size="sm"
            disabled={busy || marks === ""}
            onClick={() =>
              run(
                () =>
                  gradeLmsSubmission({
                    data: { submissionId: row.submission_id, marks: Number(marks), remarks },
                  }),
                "Marks saved.",
              )
            }
          >
            {row.graded_at ? "Update" : "Grade"}
          </Button>
        </div>
      </td>
    </tr>
  );
}

function Submissions({ assignment, onClose }) {
  const refresh = useRefreshAll();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = async () => {
    try {
      setData(await loadSubmissions({ data: { assignmentId: assignment.id } }));
    } catch (e) {
      setError(e);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment.id]);
  return (
    <div className="surface mt-4 p-4">
      <div className="flex items-center justify-between">
        <SectionTitle sub={`Max ${assignment.max_marks} marks · due ${assignment.due_on}`}>
          Submissions: {assignment.title}
        </SectionTitle>
        <Button type="button" size="sm" variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : !data ? (
        <PageSkeleton rows={2} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2">Student</th>
                <th>Work</th>
                <th>Marks</th>
                <th>Remark</th>
              </tr>
            </thead>
            <tbody>
              {data.students.map((r) => (
                <GradeRow
                  key={r.student_id}
                  row={r}
                  assignment={assignment}
                  onChanged={async () => {
                    await load();
                    await refresh();
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ManageMaterial({ m, refresh }) {
  const [removing, setRemoving] = useState(false);
  const { run } = useAction(refresh);
  const K = KIND[m.kind];
  return (
    <li className="flex items-center gap-3 py-2 text-sm">
      <K.icon className="size-4 text-primary" aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        {m.title} <span className="text-xs text-muted-foreground">· {K.label}</span>
      </span>
      {m.hasFile && (
        <DownloadButton
          label="Download"
          onFetch={() => downloadLmsFile({ data: { kind: "material", id: m.id } })}
        />
      )}
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={`Remove ${m.title}`}
        onClick={() => setRemoving(true)}
      >
        <Trash2 />
      </Button>
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title="Remove this material?"
        description={`"${m.title}" disappears for every student, along with their progress on it.`}
        confirmLabel="Remove"
        onConfirm={() => run(() => removeLmsMaterial({ data: { id: m.id } }), "Material removed.")}
      />
    </li>
  );
}

function StaffManage() {
  const { data, isLoading, error, refetch } = useLms();
  const refresh = useRefreshAll();
  const [subject, setSubject] = useState("");
  const [review, setReview] = useState(null);
  if (isLoading) return <PageSkeleton />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data.subjects.length)
    return (
      <EmptyState
        title="No subjects to manage yet"
        hint="Subjects come from the marks and attendance recorded for your students. Add those first."
      />
    );
  const current = data.subjects.find((s) => s.subject === subject) ?? data.subjects[0];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Subjects">
        {data.subjects.map((s) => (
          <Button
            key={s.subject}
            type="button"
            role="tab"
            aria-selected={s.subject === current.subject}
            size="sm"
            variant={s.subject === current.subject ? "default" : "outline"}
            onClick={() => {
              setSubject(s.subject);
              setReview(null);
            }}
          >
            {s.subject}
          </Button>
        ))}
      </div>
      {review && <Submissions assignment={review} onClose={() => setReview(null)} />}
      <SyllabusForm
        key={current.subject}
        subject={current.subject}
        syllabus={current.syllabus}
        units={current.units}
        refresh={refresh}
      />
      {current.units.map((u) => (
        <details key={u.unit} className="surface p-4" open={u.unit === 1}>
          <summary className="cursor-pointer font-numeric text-lg font-semibold">
            Unit {u.unit}: {u.title}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              · {u.materials.length} material(s) ·{" "}
              {u.assignment ? "assignment set" : "no assignment"}
            </span>
          </summary>
          <div className="mt-3">
            <div className="mb-2">
              <SyllabusDownload
                subject={current.subject}
                units={[u]}
                unit={u}
                syllabus={current.syllabus}
                label="Download this unit (PDF)"
              />
            </div>
            <UnitForm
              key={`${current.subject}-${u.unit}-${u.title}`}
              subject={current.subject}
              unit={u}
              refresh={refresh}
            />
            <ul className="mt-3 divide-y">
              {u.materials.map((m) => (
                <ManageMaterial key={m.id} m={m} refresh={refresh} />
              ))}
            </ul>
            <MaterialForm subject={current.subject} unit={u.unit} refresh={refresh} />
            <AssignmentForm
              key={`${current.subject}-${u.unit}-${u.assignment?.id ?? "new"}`}
              subject={current.subject}
              unit={u.unit}
              assignment={u.assignment}
              refresh={refresh}
              onReview={setReview}
            />
          </div>
        </details>
      ))}
    </div>
  );
}

function StaffLms() {
  const [tab, setTab] = useState("manage");
  return (
    <>
      <div className="mb-4 flex gap-2" role="tablist" aria-label="LMS views">
        {[
          ["manage", "Content and grading"],
          ["overview", "Class overview"],
        ].map(([key, label]) => (
          <Button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            variant={tab === key ? "default" : "outline"}
            size="sm"
            onClick={() => setTab(key)}
          >
            {label}
          </Button>
        ))}
      </div>
      {tab === "manage" ? <StaffManage /> : <StaffCategory category="lms" embedded />}
    </>
  );
}

export function LmsPage() {
  const { role } = useCampus();
  return (
    <RoleGate allow={["student", "faculty", "admin"]}>
      <PageTitle
        title="LMS"
        sub={
          role === "student"
            ? "Six units per subject: syllabus, learning material, assignments and your marks"
            : "Shape each subject's units, upload material, set assignments and grade work"
        }
      />
      {role === "student" ? <StudentLms /> : <StaffLms />}
    </RoleGate>
  );
}
