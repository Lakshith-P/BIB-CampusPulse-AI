import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  BookOpen,
  Brain,
  Briefcase,
  CalendarCheck,
  FileText,
  Flag,
  GraduationCap,
  LayoutGrid,
  MessageSquare,
  Pencil,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  BandBadge,
  EmptyState,
  ProgressBar,
  ScoreRing,
  SectionTitle,
  StatCard,
} from "@/components/widgets";
import {
  Academics,
  Attendance,
  FlagBadge,
  Overview,
  card,
} from "@/components/student-profile/shared";
import { Field, useAction } from "@/components/ui-kit";
import { ReadinessBreakdown } from "@/components/portal/ReadinessBreakdown";
import { addStudentNote, updateTargetRoles } from "@/lib/campus.functions";
import { useCampus } from "@/lib/use-campus";
import { liveAssignments, liveNotifications } from "@/lib/live-profile";
import { academicRisk, placementRisk, effectiveBand } from "@/lib/risk-flags";
import { lmsCompletion, lmsParts, studentAttendancePct, successScore } from "@/lib/scoring";
import { engagementScore, integrityFlags, segmentOf } from "@/lib/student-extras";

// A student's profile in the workspace. It shows only what is recorded for the student;
// anything not recorded says so instead of being invented.
const TABS = [
  { k: "Overview", icon: LayoutGrid },
  { k: "Academics", icon: GraduationCap },
  { k: "Attendance", icon: CalendarCheck },
  { k: "LMS", icon: BookOpen },
  { k: "Skills", icon: Brain },
  { k: "Placement", icon: Briefcase },
  { k: "Engagement", icon: Trophy },
  { k: "Feedback", icon: MessageSquare },
];

export function LiveStudentProfile({ s, record, me, isAdmin, isFaculty, onChanged }) {
  const [tab, setTab] = useState("Overview");
  const notes = liveNotifications(s);
  const isOwner = record?.owner_id === me;
  const canWriteFaculty = isAdmin || (isFaculty && record?.faculty_id === me);
  return (
    <div>
      <StudentHeader s={s} isOwner={isOwner} />

      <div className="mt-4 flex gap-1 overflow-x-auto border-b" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.k}
            role="tab"
            aria-selected={tab === t.k}
            onClick={() => setTab(t.k)}
            className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === t.k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <t.icon className="h-4 w-4" />
            {t.k}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "Overview" && <Overview s={s} notes={notes} />}
        {tab === "Academics" && <Academics s={s} />}
        {tab === "Attendance" && <Attendance s={s} />}
        {tab === "LMS" && <LiveLms s={s} />}
        {tab === "Skills" && <LiveSkills s={s} />}
        {tab === "Placement" && <LivePlacement s={s} isOwner={isOwner} onChanged={onChanged} />}
        {tab === "Engagement" && <LiveEngagement s={s} />}
        {tab === "Feedback" && (
          <LiveFeedback
            s={s}
            isOwner={isOwner}
            canWriteFaculty={canWriteFaculty}
            onChanged={onChanged}
          />
        )}
      </div>
    </div>
  );
}

export function StudentHeader({ s, isOwner }) {
  const r = successScore(s);
  const att = studentAttendancePct(s);
  const lms = lmsCompletion(s);
  const notes = liveNotifications(s);
  const acad = academicRisk(s);
  const place = placementRisk(s);
  const band = effectiveBand(r.score, r.band, acad, place);
  const seg = segmentOf(s);
  const alerts = notes.filter((n) => n.tone !== "info");
  return (
    <div className="flex flex-wrap items-center gap-6 rounded-2xl border bg-card p-5">
      <ScoreRing score={r.score} />
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {isOwner ? "Welcome back" : "Student profile"}
        </p>
        <h2 className="font-display text-2xl font-bold">{s.name}</h2>
        <p className="text-sm text-muted-foreground">
          {s.id} · {s.branch} · Semester {s.semester} · Graduating {s.gradYear}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {r.score === null ? (
            <BandBadge score={null} />
          ) : band === r.band ? (
            <BandBadge score={r.score} />
          ) : (
            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
              {band} (lowered by High risk flag)
            </span>
          )}
          {r.score !== null && (
            <>
              <FlagBadge label="Academic risk" flag={acad} />
              <FlagBadge label="Placement risk" flag={place} />
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                Segment: {seg.name}
              </span>
            </>
          )}
        </div>
      </div>
      <div className="ml-auto grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="CGPA" value={s.cgpa > 0 ? s.cgpa.toFixed(2) : "—"} />
        <StatCard
          label="Attendance"
          value={att === null ? "—" : att.toFixed(1) + "%"}
          tone={att !== null && att < 75 ? "danger" : "default"}
        />
        <StatCard label="LMS" value={lms === null ? "—" : lms.toFixed(0) + "%"} />
        <StatCard
          label="Alerts"
          value={String(alerts.length)}
          tone={alerts.some((n) => n.tone === "danger") ? "danger" : "warning"}
        />
      </div>
    </div>
  );
}

export function LiveLms({ s }) {
  if (!s.lms.length)
    return (
      <EmptyState
        title="No LMS data recorded yet"
        hint="Lesson and assignment progress appears here once it is added. It is not counted as zero."
      />
    );
  const parts = lmsParts(s);
  const pending = liveAssignments(s);
  const pct = (v) => (v === null ? "—" : v.toFixed(0) + "%");
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Overall LMS" value={pct(lmsCompletion(s))} />
        <StatCard label="Lessons completed" value={pct(parts.lessonsPct)} />
        <StatCard label="Assignments submitted" value={pct(parts.assignmentPct)} />
        <StatCard
          label="Logins per week"
          value={s.lmsLoginsPerWeek === undefined ? "—" : s.lmsLoginsPerWeek.toFixed(1)}
        />
        <StatCard
          label="Pending assignments"
          value={String(pending.length)}
          tone={pending.some((a) => a.daysLeft !== null && a.daysLeft < 0) ? "danger" : "default"}
        />
      </div>
      <div className={card}>
        <SectionTitle sub="Not yet submitted, soonest deadline first">
          Pending assignments
        </SectionTitle>
        <div className="space-y-2">
          {pending.map((a) => (
            <div
              key={a.subject + a.title}
              className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm"
            >
              <FileText className="h-4 w-4 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {a.title} <span className="text-muted-foreground">· {a.subject}</span>
                </p>
                <p className="text-xs text-muted-foreground">Deadline {a.deadline || "not set"}</p>
              </div>
              {a.daysLeft !== null && a.daysLeft <= 3 && (
                <span
                  className={`rounded px-1.5 text-xs ${a.daysLeft < 0 ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning"}`}
                >
                  {a.daysLeft < 0
                    ? `Overdue by ${-a.daysLeft} day(s)`
                    : `Closing in ${a.daysLeft} day(s)`}
                </span>
              )}
            </div>
          ))}
          {!pending.length && <p className="text-sm text-success">No pending assignments.</p>}
        </div>
      </div>
      {s.lms.map((sub) => {
        const done = sub.units.filter((u) => u.assignment.submitted).length;
        return (
          <details key={sub.subject} className={card}>
            <summary className="cursor-pointer font-medium">
              {sub.subject} — {done}/{sub.units.length} unit assignments submitted
            </summary>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {sub.units.map((u) => (
                <div key={u.unit} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">{u.title || `Unit ${u.unit}`}</p>
                  <ul className="mt-2 space-y-0.5 text-xs">
                    {u.lessons.map((l) => (
                      <li key={l.title} className={l.completed ? "text-success" : ""}>
                        {l.completed ? "✓" : "○"} {l.title}
                        {l.resource ? (
                          <span className="text-muted-foreground"> · {l.resource}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  {u.assignment.title !== "—" && (
                    <p className="mt-2 text-xs">
                      {u.assignment.submitted
                        ? `✓ ${u.assignment.title} submitted${u.assignment.marks === null ? "" : ` · marks ${u.assignment.marks}`}`
                        : `○ ${u.assignment.title} · deadline ${u.assignment.deadline || "not set"}`}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}

export function LiveSkills({ s }) {
  const groups = [
    [
      "Technical assessment",
      [
        ["Coding", s.skills.coding],
        ["Analytical", s.skills.analytical],
      ],
    ],
    [
      "Soft-skill assessment",
      [
        ["Verbal", s.skills.verbal],
        ["Aptitude", s.skills.aptitude],
        ["Communication", s.skills.communication],
      ],
    ],
  ];
  const any = Object.values(s.skills).some((v) => v >= 0);
  return (
    <div className="space-y-4">
      {!any && (
        <EmptyState
          title="No skill assessments recorded yet"
          hint="Scores appear here once assessments are added. Unknown is never shown as zero."
        />
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map(([title, items]) => (
          <div key={title} className={card}>
            <SectionTitle>{title}</SectionTitle>
            {items.map(([name, v]) => (
              <div key={name} className="mb-3">
                <div className="flex justify-between text-sm">
                  <span>{name}</span>
                  <span className={v >= 0 && v < 60 ? "text-destructive" : "text-muted-foreground"}>
                    {v >= 0 ? v : "Not assessed yet"}
                  </span>
                </div>
                {v >= 0 && <ProgressBar value={v} />}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The roles a student is aiming for. The student can change them here, in up to five entries. */
export function TargetRoles({ s, canEdit, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState((s.targetRoles ?? []).join(", "));
  const { busy, run } = useAction(onChanged);
  const roles = s.targetRoles ?? [];
  return (
    <div className={card}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <SectionTitle sub="Your role match and skill gaps are measured against these">
          Target roles
        </SectionTitle>
        {canEdit && !editing && (
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil /> {roles.length ? "Edit target roles" : "Add target roles"}
          </Button>
        )}
      </div>
      {editing ? (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(
              () =>
                updateTargetRoles({
                  data: {
                    targetRoles: value
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean)
                      .slice(0, 5),
                  },
                }),
              "Target roles updated.",
            );
            if (r.ok) setEditing(false);
          }}
        >
          <Field
            label="Roles I am aiming for"
            hint="Separate with commas, up to five. Example: Software Engineer, Data Analyst"
          >
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={300}
              placeholder="Software Engineer, Data Analyst"
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              Save roles
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setValue(roles.join(", "));
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : roles.length ? (
        <div className="flex flex-wrap gap-2">
          {roles.map((role) => (
            <span key={role} className="rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
              {role}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {canEdit
            ? "No target role chosen yet. Add up to five to see how your skills compare."
            : "No target role selected yet."}
        </p>
      )}
    </div>
  );
}

export function LivePlacement({ s, isOwner = false, onChanged }) {
  const { refresh } = useCampus();
  return (
    <div className="space-y-4">
      <ReadinessBreakdown s={s} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <SectionTitle sub="From your profile">Resume</SectionTitle>
          {s.resumeCompleteness >= 0 ? (
            <>
              <div className="flex justify-between text-sm">
                <span>Completeness</span>
                <span>{s.resumeCompleteness}%</span>
              </div>
              <ProgressBar value={s.resumeCompleteness} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Resume completeness not recorded yet.</p>
          )}
        </div>
        <TargetRoles s={s} canEdit={isOwner} onChanged={onChanged ?? refresh} />
      </div>
    </div>
  );
}

export function LiveEngagement({ s }) {
  const flags = integrityFlags(s);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <StatCard
          label="Engagement score"
          value={s.engagement.length ? `${engagementScore(s)} / 100` : "—"}
          sub="Verified activities only"
        />
        <StatCard label="Activities" value={String(s.engagement.length)} />
        <StatCard
          label="Integrity flags"
          value={String(flags.length)}
          tone={flags.length ? "warning" : "success"}
        />
      </div>
      {flags.length > 0 && (
        <div className={card}>
          <SectionTitle>Evidence check</SectionTitle>
          {flags.map((f) => (
            <p key={f.detail} className="flex gap-2 text-sm text-warning">
              <Flag className="h-4 w-4 shrink-0" />
              <span>
                <b>{f.kind}:</b> {f.detail}
              </span>
            </p>
          ))}
        </div>
      )}
      <div className={card}>
        <SectionTitle>Activities</SectionTitle>
        {s.engagement.length ? (
          s.engagement.map((e) => (
            <div key={e.name + e.date} className="flex justify-between gap-3 border-t py-2 text-sm">
              <span>
                <span className="capitalize text-muted-foreground">{e.type}</span> · {e.name}
                <span className="block text-xs text-muted-foreground">
                  {e.date}
                  {e.evidence ? ` · evidence: ${e.evidence}` : ""}
                </span>
              </span>
              <span className={e.verified ? "text-success" : "text-warning"}>
                {e.verified ? "Verified" : "Pending evidence"}
              </span>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No activities recorded yet.</p>
        )}
      </div>
    </div>
  );
}

function NoteForm({ kind, recordId, onChanged, placeholder, button, withAbout }) {
  const add = useServerFn(addStudentNote);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function submit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setMsg("");
    try {
      await add({
        data: {
          kind,
          recordId,
          note: String(f.get("note")),
          ...(withAbout ? { about: String(f.get("about") || "General") } : {}),
        },
      });
      form.reset();
      await onChanged();
      setMsg("Saved.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="mt-4 space-y-2 border-t pt-4">
      {withAbout && (
        <input
          name="about"
          maxLength={100}
          placeholder="About which class or teacher? (optional)"
          aria-label="About"
          className="w-full rounded-md border bg-background p-2 text-sm"
        />
      )}
      <Textarea
        name="note"
        required
        minLength={5}
        maxLength={1000}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={busy}>
          {button}
        </Button>
        {msg && (
          <span role="status" className="text-sm text-muted-foreground">
            {msg}
          </span>
        )}
      </div>
    </form>
  );
}

export function LiveFeedback({ s, isOwner, canWriteFaculty, onChanged }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard
          label="Student satisfaction"
          value={s.satisfaction === undefined ? "—" : `${s.satisfaction.toFixed(1)} / 5`}
        />
        <StatCard label="Faculty notes" value={String(s.facultyFeedback.length)} />
        <StatCard label="Student notes" value={String(s.studentFeedback.length)} />
      </div>
      <div className={card}>
        <SectionTitle sub="Written by your teachers">Faculty feedback</SectionTitle>
        {s.facultyFeedback.length ? (
          s.facultyFeedback.map((f, i) => (
            <div key={i} className="border-t py-2 text-sm">
              <p className="font-medium">
                {f.from} <span className="text-xs text-muted-foreground">· {f.date}</span>
              </p>
              <p className="text-muted-foreground">{f.note}</p>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No faculty feedback yet.</p>
        )}
        {canWriteFaculty && (
          <NoteForm
            kind="faculty"
            recordId={s.id}
            onChanged={onChanged}
            placeholder="Write feedback for this student"
            button="Add feedback"
          />
        )}
      </div>
      <div className={card}>
        <SectionTitle sub="Feedback from the student about classes and teaching">
          Student feedback
        </SectionTitle>
        {s.studentFeedback.length ? (
          s.studentFeedback.map((f, i) => (
            <div key={i} className="border-t py-2 text-sm">
              <p className="font-medium">
                {f.about} <span className="text-xs text-muted-foreground">· {f.date}</span>
              </p>
              <p className="text-muted-foreground">{f.note}</p>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No student feedback yet.</p>
        )}
        {isOwner && (
          <NoteForm
            kind="student"
            recordId={s.id}
            onChanged={onChanged}
            placeholder="How is your class going? What can improve?"
            button="Send feedback"
            withAbout
          />
        )}
      </div>
      {isOwner && (
        <div className={card}>
          <SectionTitle sub="Confidential — read only by administrators">
            Raise a concern
          </SectionTitle>
          <p className="text-sm text-muted-foreground">
            To report disturbance in class, decorum issues or harassment, send a private message
            from the{" "}
            <Link to="/contact" className="text-primary underline">
              Contact page
            </Link>
            . Administrators read these messages and will follow up.
          </p>
        </div>
      )}
    </div>
  );
}
