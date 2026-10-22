import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BandBadge, EmptyState, SectionTitle } from "@/components/widgets";
import { AdminTools } from "@/components/AdminTools";
import { InterventionCard, InterventionForm, SupportPlan } from "@/components/portal/Interventions";
import { PageTitle, RoleGate } from "@/components/portal/PortalShell";
import { StudentTable, pct } from "@/components/portal/StudentTable";
import { AcademicsEditor } from "@/components/portal/AcademicsEditor";
import { LiveStudentProfile } from "@/components/student-profile/LiveStudentProfile";
import { byAttention, isAtRisk, lowAttendance } from "@/lib/campus-derive";
import { listAccounts, listAudit } from "@/lib/campus.functions";
import { liveAssignments } from "@/lib/live-profile";
import { attendancePct } from "@/lib/scoring";
import { useCampus } from "@/lib/use-campus";

const card = "surface p-4";
const STAFF = ["faculty", "admin"];

// ---------------------------------------------------------------- students
export function StudentsPage() {
  const { rows, isAdmin, refresh } = useCampus();
  const [importing, setImporting] = useState(false);
  return (
    <RoleGate allow={STAFF}>
      <PageTitle
        title={isAdmin ? "All students" : "My students"}
        sub={
          isAdmin
            ? "Every student on campus, by year, course and section"
            : "Students assigned to you"
        }
      />
      {isAdmin && (
        <div className="mb-4">
          <Button type="button" variant="outline" onClick={() => setImporting((v) => !v)}>
            {importing ? "Close import" : "Import students from CSV"}
          </Button>
          {importing && (
            <div className={`${card} mt-3`}>
              <AdminTools
                tabs={["csv"]}
                students={rows.map((r) => r.s)}
                records={rows.map((r) => r.rec)}
                selectedId=""
                onSaved={refresh}
              />
            </div>
          )}
        </div>
      )}
      {rows.length === 0 ? (
        <EmptyState
          title={isAdmin ? "No students yet" : "No students assigned to you yet"}
          hint={
            isAdmin
              ? "Students appear after they sign up and are assigned to a teacher."
              : "An administrator assigns students to teachers."
          }
        />
      ) : (
        <StudentTable rows={rows} showMentor={isAdmin} />
      )}
    </RoleGate>
  );
}

export function StudentDetailPage({ id }) {
  const { rows, profile, isAdmin, isFaculty, refresh } = useCampus();
  const row = rows.find((r) => r.id === id);
  return (
    <RoleGate allow={STAFF}>
      <Link
        to="/portal/students"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to students
      </Link>
      {!row ? (
        <EmptyState
          title="Student not found"
          hint="This student does not exist, or is not assigned to you."
        />
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            Teacher: <b className="text-foreground">{row.mentorName || "not assigned"}</b>
            {row.ownerEmail && <> · Account: {row.ownerEmail}</>}
            {isAdmin && (
              <>
                {" · "}
                <Link to="/portal/records" className="text-primary underline">
                  Edit details
                </Link>
              </>
            )}
          </p>
          <LiveStudentProfile
            key={row.id}
            s={row.s}
            record={row.rec}
            me={profile.id}
            isAdmin={isAdmin}
            isFaculty={isFaculty}
            onChanged={refresh}
          />
          <AcademicsEditor s={row.s} onSaved={refresh} />
          <SupportPlan studentId={row.id} canManage />
        </>
      )}
    </RoleGate>
  );
}

// ---------------------------------------------------------------- interventions
export function InterventionsPage() {
  const { interventions, rows, today } = useCampus();
  const [status, setStatus] = useState("active");
  const names = new Map(rows.map((r) => [r.id, r.name]));
  const shown = interventions
    .filter((i) =>
      status === "active" ? i.status !== "resolved" : status === "all" ? true : i.status === status,
    )
    .sort((a, b) => a.follow_up_date.localeCompare(b.follow_up_date));
  const overdue = interventions.filter((i) => i.status !== "resolved" && i.follow_up_date < today);
  return (
    <RoleGate allow={STAFF}>
      <PageTitle title="Interventions" sub="Support actions for students who need help">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter interventions"
          className="rounded-md border bg-background p-2 text-sm"
        >
          <option value="active">Open and in progress</option>
          <option value="open">Open</option>
          <option value="in-progress">In progress</option>
          <option value="resolved">Resolved</option>
          <option value="all">All</option>
        </select>
      </PageTitle>
      {overdue.length > 0 && (
        <p className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {overdue.length} follow-up(s) are past their date.
        </p>
      )}
      <div className="space-y-3">
        {shown.length === 0 && (
          <p className="text-sm text-muted-foreground">No interventions in this view.</p>
        )}
        {shown.map((i) => (
          <InterventionCard key={i.id} item={i} studentName={names.get(i.student_id)} canManage />
        ))}
      </div>
      {rows.length > 0 && (
        <div className="mt-6">
          <InterventionForm choices={byAttention(rows)} />
        </div>
      )}
    </RoleGate>
  );
}

// ---------------------------------------------------------------- attendance & risk monitor
function Section({ title, sub, empty, items }) {
  return (
    <section className={card}>
      <SectionTitle sub={sub}>
        {title} ({items.length})
      </SectionTitle>
      {items.length === 0 ? (
        <p className="text-sm text-success">{empty}</p>
      ) : (
        <div className="divide-y">
          {items.slice(0, 25).map((x) => (
            <div
              key={x.row.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
            >
              <div className="min-w-0">
                <Link
                  to="/portal/students/$id"
                  params={{ id: x.row.id }}
                  className="font-medium text-primary hover:underline"
                >
                  {x.row.name}
                </Link>
                <p className="text-xs text-muted-foreground">{x.detail}</p>
              </div>
              <BandBadge score={x.row.score} />
            </div>
          ))}
          {items.length > 25 && (
            <p className="pt-2 text-xs text-muted-foreground">Showing the 25 most urgent.</p>
          )}
        </div>
      )}
    </section>
  );
}

export function MonitorPage() {
  const { rows, today } = useCampus();
  const lowAtt = byAttention(rows.filter(lowAttendance))
    .sort((a, b) => a.attendance - b.attendance)
    .map((row) => ({
      row,
      detail:
        `Overall ${pct(row.attendance)} · ` +
        row.s.subjects
          .filter((x) => (attendancePct(x.classesAttended, x.classesHeld) ?? 100) < 75)
          .map((x) => `${x.subject} ${pct(attendancePct(x.classesAttended, x.classesHeld))}`)
          .join(", "),
    }));
  const academic = byAttention(
    rows.filter((r) => r.s.backlogs > 0 || r.s.subjects.some((x) => x.marks < 60)),
  ).map((row) => ({
    row,
    detail: [
      row.s.backlogs ? `${row.s.backlogs} backlog(s)` : "",
      ...row.s.subjects.filter((x) => x.marks < 60).map((x) => `${x.subject} ${x.marks}/100`),
    ]
      .filter(Boolean)
      .join(", "),
  }));
  const lms = byAttention(
    rows.filter(
      (r) =>
        (r.lms !== null && r.lms < 50) ||
        liveAssignments(r.s, today).some((a) => a.daysLeft !== null && a.daysLeft < 0),
    ),
  ).map((row) => {
    const late = liveAssignments(row.s, today).filter((a) => a.daysLeft !== null && a.daysLeft < 0);
    return {
      row,
      detail: `LMS ${pct(row.lms)}${late.length ? ` · ${late.length} overdue assignment(s)` : ""}`,
    };
  });
  const noData = rows
    .filter((r) => r.score === null)
    .map((row) => ({ row, detail: "No marks, attendance or skills recorded yet" }));
  return (
    <RoleGate allow={STAFF}>
      <PageTitle title="Attendance & risk" sub="Who is falling behind, and where" />
      {rows.length === 0 ? (
        <EmptyState title="No students to monitor yet" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section
            title="Attendance below 75%"
            sub="Lowest first"
            empty="Nobody is below 75%."
            items={lowAtt}
          />
          <Section
            title="Academic concerns"
            sub="Backlogs or a subject under 60 marks"
            empty="No academic concerns."
            items={academic}
          />
          <Section
            title="LMS falling behind"
            sub="Under 50% complete or overdue work"
            empty="Everyone is keeping up on the LMS."
            items={lms}
          />
          <Section
            title="Missing data"
            sub="Their status cannot be worked out yet"
            empty="Every student has data."
            items={noData}
          />
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        {rows.filter(isAtRisk).length} student(s) are currently flagged as needing help overall.
      </p>
    </RoleGate>
  );
}

// ---------------------------------------------------------------- teachers (admin)
export function TeachersPage() {
  const { rows, interventions } = useCampus();
  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: () => listAccounts(),
  });
  const teachers = (accounts.data ?? []).filter((p) => p.roles.includes("faculty"));
  return (
    <RoleGate allow={["admin"]}>
      <PageTitle title="Teachers" sub="Workload and how their students are doing">
        <Button asChild>
          <Link to="/portal/assign">Assign students</Link>
        </Button>
      </PageTitle>
      {accounts.isLoading && <p className="text-sm">Loading…</p>}
      {accounts.data && teachers.length === 0 && (
        <EmptyState
          title="No teachers yet"
          hint="Open People & roles and choose Make faculty next to a teacher's account."
        />
      )}
      {teachers.length > 0 && (
        <div className="overflow-x-auto surface">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Teacher</th>
                <th>Students</th>
                <th>Average score</th>
                <th>Need help</th>
                <th>Open follow-ups</th>
              </tr>
            </thead>
            <tbody>
              {teachers.map((t) => {
                const mine = rows.filter((r) => r.mentorId === t.id);
                const ids = new Set(mine.map((r) => r.id));
                const scored = mine.filter((r) => r.score !== null);
                const open = interventions.filter(
                  (i) => ids.has(i.student_id) && i.status !== "resolved",
                ).length;
                return (
                  <tr key={t.id} className="border-b last:border-0">
                    <td className="p-3">
                      <span className="font-medium">{t.name || t.email}</span>
                      <span className="block text-xs text-muted-foreground">{t.email}</span>
                    </td>
                    <td>{mine.length}</td>
                    <td>
                      {scored.length
                        ? Math.round(scored.reduce((a, r) => a + r.score, 0) / scored.length)
                        : "—"}
                    </td>
                    <td className={mine.filter(isAtRisk).length ? "text-destructive" : ""}>
                      {mine.filter(isAtRisk).length}
                    </td>
                    <td>{open}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </RoleGate>
  );
}

// ---------------------------------------------------------------- admin tools as pages
function AdminPage({ title, sub, tabs }) {
  const { rows, refresh } = useCampus();
  return (
    <RoleGate allow={["admin"]}>
      <PageTitle title={title} sub={sub} />
      <AdminTools
        tabs={tabs}
        students={rows.map((r) => r.s)}
        records={rows.map((r) => r.rec)}
        selectedId=""
        onSaved={refresh}
      />
    </RoleGate>
  );
}

export const AssignPage = () => (
  <AdminPage title="Assign students" sub="Connect students to their teachers" tabs={["connect"]} />
);
export const PeoplePage = () => (
  <AdminPage title="People & roles" sub="Give teacher or administrator access" tabs={["people"]} />
);
export const RecordsPage = () => (
  <AdminPage
    title="Student records"
    sub="Add marks, attendance and skills, one student or many"
    tabs={["student", "csv", "json"]}
  />
);
export const MessagesPage = () => (
  <AdminPage title="Messages" sub="Contact messages and concerns" tabs={["messages"]} />
);

// ---------------------------------------------------------------- audit log (admin)
const OPERATION = {
  INSERT: "Record created",
  UPDATE: "Record updated",
  LINK: "Teacher link changed",
  NOTE: "Feedback added",
  PASSWORD: "Password reset",
  DELETE: "Account deleted",
};

export function AuditPage() {
  const audit = useQuery({
    queryKey: ["audit"],
    queryFn: () => listAudit(),
  });
  return (
    <RoleGate allow={["admin"]}>
      <PageTitle title="Audit log" sub="The latest 200 changes to student records" />
      {audit.isLoading && <p className="text-sm">Loading…</p>}
      {audit.isError && <p className="text-sm text-destructive">The log could not be loaded.</p>}
      {audit.data?.length === 0 && <EmptyState title="Nothing has changed yet" />}
      {audit.data?.length > 0 && (
        <div className="overflow-x-auto surface">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3">When</th>
                <th>Who</th>
                <th>What</th>
                <th>Record</th>
              </tr>
            </thead>
            <tbody>
              {audit.data.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="p-3 whitespace-nowrap">
                    {new Date(a.created_at).toLocaleString()}
                  </td>
                  <td>{a.actor_email ?? "system"}</td>
                  <td>{OPERATION[a.operation] ?? a.operation}</td>
                  <td>{a.record_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </RoleGate>
  );
}
