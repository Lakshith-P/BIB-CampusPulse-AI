import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, CheckCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, SectionTitle, StatCard } from "@/components/widgets";
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
  buildTimetable,
  loadAttendanceSubjects,
  loadAttendanceRoster,
  loadMyAttendance,
  loadRecentSessions,
  removeTimetableSlot,
  saveAttendance,
  saveTimetableSlot,
} from "@/lib/platform.functions";
import { campusOptions, useCampus } from "@/lib/use-campus";
import { KEYS, useTimetable, useTimetableCoverage } from "@/lib/use-platform";
import { todayIso } from "@/lib/live-profile";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ---------------------------------------------------------------- mark attendance (staff)
export function MarkAttendance() {
  const qc = useQueryClient();
  const subjectsQuery = useQuery({
    queryKey: ["attendance-subjects"],
    queryFn: () => loadAttendanceSubjects(),
  });
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState(todayIso());
  const [period, setPeriod] = useState(1);
  const [present, setPresent] = useState({});
  const subjects = subjectsQuery.data ?? [];
  const current = subject || subjects[0] || "";
  const key = ["attendance-roster", current, date, period];
  const roster = useQuery({
    queryKey: key,
    queryFn: () => loadAttendanceRoster({ data: { subject: current, date, period } }),
    enabled: Boolean(current && date),
  });
  const recent = useQuery({
    queryKey: ["attendance-recent", current],
    queryFn: () => loadRecentSessions({ data: { subject: current } }),
    enabled: Boolean(current),
  });
  // Start from the saved marks (or everyone present) whenever the class being marked changes.
  useEffect(() => {
    if (roster.data)
      setPresent(Object.fromEntries(roster.data.students.map((s) => [s.id, s.present])));
  }, [roster.data]);
  const { busy, run } = useAction(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: key }),
      qc.invalidateQueries({ queryKey: ["attendance-recent", current] }),
      qc.invalidateQueries({ queryKey: campusOptions.queryKey }),
    ]);
  });

  if (subjectsQuery.isLoading) return <PageSkeleton rows={2} />;
  if (subjectsQuery.error)
    return <ErrorState error={subjectsQuery.error} onRetry={subjectsQuery.refetch} />;
  if (!subjects.length)
    return (
      <EmptyState
        title="No subjects to mark"
        hint="Subjects appear here once students have them on their record."
      />
    );
  const students = roster.data?.students ?? [];
  const absentCount = students.filter((s) => present[s.id] === false).length;
  return (
    <div className="space-y-4">
      <SectionTitle sub="Choose a date and period to review saved marks. Changes update student attendance only after you save. Everyone starts as present; tick who is absent.">
        Mark attendance
      </SectionTitle>
      <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3">
        <Field label="Subject">
          <select
            className={inputClass}
            value={current}
            onChange={(e) => setSubject(e.target.value)}
          >
            {subjects.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <Input
            type="date"
            value={date}
            max={todayIso()}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Period" hint="Use different periods for two classes on one day.">
          <select
            className={inputClass}
            value={period}
            onChange={(e) => setPeriod(Number(e.target.value))}
          >
            {Array.from({ length: 8 }, (_, i) => i + 1).map((p) => (
              <option key={p} value={p}>
                Period {p}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {roster.error ? (
        <ErrorState error={roster.error} onRetry={roster.refetch} />
      ) : roster.isLoading ? (
        <PageSkeleton rows={3} />
      ) : !students.length ? (
        <EmptyState
          title="No students in this class"
          hint="No students are currently enrolled in this subject."
        />
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () =>
                saveAttendance({
                  data: {
                    subject: current,
                    date,
                    period,
                    marks: students.map((s) => ({
                      studentId: s.id,
                      present: present[s.id] !== false,
                    })),
                  },
                }),
              roster.data.marked ? "Attendance updated." : "Attendance saved.",
            );
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {students.length - absentCount} present · {absentCount} absent
              {roster.data.marked && " · already marked, saving will update it"}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setPresent(Object.fromEntries(students.map((s) => [s.id, true])))}
            >
              <CheckCheck /> Mark all present
            </Button>
          </div>
          <ul className="divide-y rounded-xl border bg-card">
            {students.map((s) => {
              const here = present[s.id] !== false;
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0 truncate text-sm">
                    <span className="font-medium">{s.name}</span>{" "}
                    <span className="text-xs text-muted-foreground">{s.id}</span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={here}
                    aria-label={`${s.name} ${here ? "present" : "absent"}`}
                    onClick={() => setPresent({ ...present, [s.id]: !here })}
                    className="min-h-9 shrink-0 rounded-full"
                  >
                    <StatusPill tone={here ? "success" : "danger"}>
                      {here ? "Present" : "Absent"}
                    </StatusPill>
                  </button>
                </li>
              );
            })}
          </ul>
          <Button type="submit" disabled={busy}>
            Save attendance
          </Button>
        </form>
      )}
      {recent.data?.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-medium">Recent classes</p>
          <ul className="divide-y rounded-xl border bg-card text-sm">
            {recent.data.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                <button
                  type="button"
                  className="text-left underline-offset-2 hover:underline"
                  onClick={() => {
                    setDate(r.held_on);
                    setPeriod(r.period);
                  }}
                >
                  {r.held_on} · Period {r.period}
                </button>
                <span className="text-muted-foreground">
                  {r.present} present · {r.absent} absent
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- timetable
function SlotForm({ subjects, onSaved }) {
  const [f, setF] = useState({
    subject: subjects[0],
    day: 1,
    start: "09:00",
    end: "10:00",
    room: "",
  });
  const { busy, run } = useAction(onSaved);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-5"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => saveTimetableSlot({ data: { ...f, day: Number(f.day) } }),
          "Class added to the timetable.",
        );
      }}
    >
      <Field label="Subject">
        <select className={inputClass} value={f.subject} onChange={set("subject")}>
          {subjects.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Field>
      <Field label="Day">
        <select className={inputClass} value={f.day} onChange={set("day")}>
          {DAYS.map((d, i) => (
            <option key={d} value={i + 1}>
              {d}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Starts">
        <Input type="time" value={f.start} onChange={set("start")} required />
      </Field>
      <Field label="Ends">
        <Input type="time" value={f.end} onChange={set("end")} required />
      </Field>
      <Field label="Room">
        <Input value={f.room} onChange={set("room")} maxLength={60} />
      </Field>
      <div className="sm:col-span-5">
        <Button type="submit" size="sm" disabled={busy}>
          Add class
        </Button>
      </div>
    </form>
  );
}

/** The weekly timetable. Teachers and administrators can add and remove classes. */
export function Timetable({ canEdit }) {
  const { data, isLoading, error, refetch } = useTimetable();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: KEYS.timetable });
  const { busy, run } = useAction(refresh);
  if (isLoading) return <PageSkeleton rows={2} />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  return (
    <section className="space-y-3" aria-label="Timetable">
      <SectionTitle
        sub={
          canEdit
            ? "Set when each subject meets. Students see this too."
            : "When each of your subjects meets."
        }
      >
        Timetable
      </SectionTitle>
      {canEdit && data.subjects.length > 0 && (
        <SlotForm subjects={data.subjects} onSaved={refresh} />
      )}
      {!data.slots.length ? (
        <EmptyState
          title="No timetable yet"
          hint={
            canEdit
              ? "Add the first class above."
              : "Your teacher has not published a timetable yet."
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {DAYS.map((name, i) => {
            const slots = data.slots.filter((s) => s.day === i + 1);
            if (!slots.length) return null;
            return (
              <div key={name} className="rounded-xl border bg-card p-3">
                <p className="mb-2 text-sm font-semibold">{name}</p>
                <ul className="space-y-2">
                  {slots.map((s) => (
                    <li key={s.id} className="flex items-start justify-between gap-2 text-sm">
                      <span>
                        <span className="font-medium tabular-nums">
                          {s.start}–{s.end}
                        </span>{" "}
                        {s.subject}
                        {s.room && <span className="text-muted-foreground"> · {s.room}</span>}
                      </span>
                      {canEdit && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={busy}
                          aria-label={`Remove ${s.subject} on ${name}`}
                          onClick={() =>
                            run(() => removeTimetableSlot({ data: { id: s.id } }), "Class removed.")
                          }
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- student log
const LOG_FILTERS = [
  ["all", "All classes"],
  ["present", "Present only"],
  ["absent", "Absent only"],
];

/**
 * A student's own marked classes, so a percentage can be traced to the days behind it. Every
 * class says whether they were present or absent, across one subject or all of them.
 */
export function MyAttendanceLog({ subjects }) {
  const [subject, setSubject] = useState("");
  const [only, setOnly] = useState("all");
  const log = useQuery({
    queryKey: ["my-attendance", subject || "all"],
    queryFn: () => loadMyAttendance({ data: { subject } }),
  });
  if (!subjects.length) return null;
  const sessions = (log.data?.sessions ?? []).filter((r) =>
    only === "all" ? true : only === "present" ? r.present : !r.present,
  );
  const marked = log.data ? log.data.present + log.data.absent : 0;
  return (
    <section className="space-y-3" aria-label="Class by class attendance">
      <SectionTitle sub="Every class your teachers have marked, newest first.">
        Attendance history
      </SectionTitle>
      {marked > 0 && (
        <div className="grid grid-cols-3 gap-x-6 gap-y-5">
          <StatCard label="Classes marked" value={String(marked)} />
          <StatCard label="Present" value={String(log.data.present)} tone="success" />
          <StatCard
            label="Absent"
            value={String(log.data.absent)}
            tone={log.data.absent ? "danger" : "default"}
          />
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <select
          className={inputClass + " max-w-xs"}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          aria-label="Subject"
        >
          <option value="">All subjects</option>
          {subjects.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <div className="flex gap-1" role="group" aria-label="Show">
          {LOG_FILTERS.map(([key, label]) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={only === key ? "secondary" : "ghost"}
              aria-pressed={only === key}
              onClick={() => setOnly(key)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      {log.error ? (
        <ErrorState error={log.error} onRetry={log.refetch} />
      ) : log.isLoading ? (
        <PageSkeleton rows={2} />
      ) : !sessions.length ? (
        <EmptyState
          title={marked ? "No classes match this filter" : "No classes marked yet"}
          hint={
            marked
              ? "Change the subject or the filter above."
              : "Each class your teacher marks appears here, present or absent."
          }
        />
      ) : (
        <ul className="divide-y rounded-xl border bg-card text-sm">
          {sessions.map((r) => (
            <li
              key={`${r.subject}-${r.held_on}-${r.period}`}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <span className="min-w-0">
                <span className="font-medium">{r.held_on}</span>
                <span className="text-muted-foreground"> - Period {r.period}</span>
                <span className="block truncate text-xs text-muted-foreground">{r.subject}</span>
              </span>
              <StatusPill tone={r.present ? "success" : "danger"}>
                {r.present ? "Present" : "Absent"}
              </StatusPill>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- timetable coverage (staff)
/**
 * Which students have classes on the timetable. A student's week is built from the subjects on
 * their record, so a subject with no slots leaves them without a timetable until one is added.
 */
/**
 * Fills the week for every subject students take, so nobody is left without a timetable.
 * Administrators only: one press writes the timetable the whole campus sees.
 */
function GenerateWeek({ onDone }) {
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState(null);
  const { busy, run } = useAction(onDone);
  const build = async (replace) => {
    const r = await run(
      async () => {
        const out = await buildTimetable({ data: { replace } });
        setResult(out);
        return out;
      },
      replace ? "The week was rebuilt for every subject." : "Classes were added for every subject.",
    );
    if (!r.ok) setResult(null);
  };
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-sm font-semibold">Assign a timetable to every student</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Each subject taken by a student gets classes across the week, and two subjects the same
        student takes are never put in the same period. Subjects that already have classes are left
        alone.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={() => build(false)}>
          <CalendarPlus /> Fill the gaps
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => setConfirming(true)}
        >
          Rebuild the whole week
        </Button>
      </div>
      {result && (
        <div className="mt-3 text-sm">
          <p>
            <b className="tabular-nums">{result.added}</b> classes added across{" "}
            <b className="tabular-nums">{result.subjects}</b> subjects
            {result.kept > 0 && ` · ${result.kept} subjects already had a timetable`}.
          </p>
          <p className="text-muted-foreground">
            {result.students.with_classes} of {result.students.total} students now have classes
            {result.students.without_subjects > 0 &&
              ` · ${result.students.without_subjects} have no subjects on their record yet, so there is nothing to schedule for them`}
            .
          </p>
          {result.unplaced.length > 0 && (
            <p className="text-warning">
              No free period was found for: {result.unplaced.map((u) => u.subject).join(", ")}.
            </p>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Rebuild the whole week?"
        description="Every class on the timetable is removed and the week is planned again from scratch. Attendance already marked is not affected."
        confirmLabel="Rebuild"
        onConfirm={() => build(true)}
      />
    </div>
  );
}

export function TimetableCoverage() {
  const { data, isLoading, error, refetch } = useTimetableCoverage();
  const { isAdmin } = useCampus();
  const qc = useQueryClient();
  const [onlyGaps, setOnlyGaps] = useState(false);
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: KEYS.timetableCoverage }),
      qc.invalidateQueries({ queryKey: KEYS.timetable }),
    ]);
  if (isLoading) return <PageSkeleton rows={2} />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data.length)
    return (
      <EmptyState
        title="No students yet"
        hint="Students assigned to you appear here with the classes scheduled for them."
      />
    );
  const without = data.filter((r) => r.classes === 0);
  const partial = data.filter((r) => r.classes > 0 && r.missing.length > 0);
  const shown = onlyGaps ? data.filter((r) => r.missing.length > 0) : data;
  return (
    <section className="space-y-3" aria-label="Timetable coverage">
      <SectionTitle sub="Every student should have a class for each subject on their record.">
        Timetable per student
      </SectionTitle>
      {isAdmin && <GenerateWeek onDone={refresh} />}
      <div className="grid grid-cols-3 gap-x-6 gap-y-5">
        <StatCard label="Students" value={String(data.length)} />
        <StatCard
          label="No timetable at all"
          value={String(without.length)}
          tone={without.length ? "danger" : "success"}
        />
        <StatCard
          label="Some subjects unscheduled"
          value={String(partial.length)}
          tone={partial.length ? "warning" : "success"}
        />
      </div>
      <Button
        type="button"
        size="sm"
        variant={onlyGaps ? "secondary" : "outline"}
        aria-pressed={onlyGaps}
        onClick={() => setOnlyGaps((v) => !v)}
      >
        {onlyGaps ? "Showing students with gaps" : "Show only students with gaps"}
      </Button>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-2">Student</th>
              <th className="p-2">Branch</th>
              <th className="p-2">Subjects</th>
              <th className="p-2">Classes a week</th>
              <th className="p-2">Subjects with no class yet</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">
                  <span className="font-medium">{r.name}</span>
                  <span className="block text-xs text-muted-foreground">{r.id}</span>
                </td>
                <td className="p-2">{r.branch || "Not set"}</td>
                <td className="p-2 tabular-nums">{r.subjects.length}</td>
                <td className="p-2 tabular-nums">
                  {r.classes === 0 ? <StatusPill tone="danger">None</StatusPill> : r.classes}
                </td>
                <td className="p-2 text-muted-foreground">
                  {r.missing.length ? r.missing.join(", ") : "All scheduled"}
                </td>
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={5} className="p-3 text-success">
                  Every student has a class for each of their subjects.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Add the missing classes with the form above; each one reaches every student who takes that
        subject.
      </p>
    </section>
  );
}
