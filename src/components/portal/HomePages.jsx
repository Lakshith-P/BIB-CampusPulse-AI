import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { BandBadge, EmptyState, SectionTitle, StatCard } from "@/components/widgets";
import { OverviewHub } from "@/components/portal/OverviewHub";
import { CampusRiskIdentification } from "@/components/portal/RiskIdentification";
import { FacultyInsights } from "@/components/portal/FacultyInsights";
import { AdminAnalytics } from "@/components/portal/AdminAnalytics";
import { CampusInsights } from "@/components/portal/CampusInsights";
import { Banner, BannerStat } from "@/components/portal/PortalShell";
import { StudentDashboard } from "@/components/portal/StudentDashboard";
import { pct } from "@/components/portal/StudentTable";
import { BAND_ORDER, averages, byAttention, isAtRisk, lowAttendance } from "@/lib/campus-derive";
import { useCampus } from "@/lib/use-campus";

const card = "surface p-5";
const BAND_BAR = {
  "On Track": "bg-risk-track",
  Monitor: "bg-risk-monitor",
  "Needs Attention": "bg-risk-attention",
  "High Priority": "bg-risk-critical",
};

// "Prof. Iyer" should be greeted as Iyer, not "Prof."
const firstName = (name) => {
  const parts = (name || "there").trim().split(/\s+/);
  return /\.$/.test(parts[0]) && parts[1] ? parts[1] : parts[0];
};

export function HomePage() {
  const { role } = useCampus();
  if (role === "admin") return <AdminHome />;
  if (role === "faculty") return <FacultyHome />;
  return <StudentHome />;
}

/** Academic averages for the students in view; missing values are skipped, never counted as zero. */
function AcademicStats({ rows }) {
  const a = averages(rows);
  const f = (v, suffix = "") => (v === null ? "—" : v.toFixed(1) + suffix);
  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-5">
        <StatCard label="Avg success score" value={f(a.avgScore)} sub="out of 100" />
        <StatCard label="Avg CGPA" value={f(a.avgCgpa)} />
        <StatCard
          label="Avg attendance"
          value={f(a.avgAtt, "%")}
          tone={a.avgAtt !== null && a.avgAtt < 75 ? "danger" : "default"}
        />
        <StatCard label="LMS completion" value={f(a.avgLms, "%")} />
        <StatCard label="Placement readiness" value={f(a.avgPlace, "%")} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Data coverage {a.coverage.toFixed(1)}% ({a.missing} of {a.cells} indicators not yet
        recorded; missing values are never counted as zero).
      </p>
    </>
  );
}

// ---------------------------------------------------------------- student
function StudentHome() {
  return <StudentDashboard />;
}

// ---------------------------------------------------------------- shared staff bits
function AttentionList({ rows, empty }) {
  const needy = byAttention(rows).filter((r) => isAtRisk(r) || lowAttendance(r) || r.urgent);
  return (
    <div className="divide-y">
      {needy.length === 0 && <p className="py-2 text-sm text-success">{empty}</p>}
      {needy.slice(0, 6).map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
          <div className="min-w-0">
            <Link
              to="/portal/students/$id"
              params={{ id: r.id }}
              className="font-medium text-primary hover:underline"
            >
              {r.name}
            </Link>
            <p className="truncate text-xs text-muted-foreground">
              {r.id} · attendance {pct(r.attendance)} · {r.alerts} alert(s)
            </p>
          </div>
          <BandBadge score={r.score} />
        </div>
      ))}
    </div>
  );
}

function FollowUps({ limit = 5 }) {
  const { interventions, rows, today } = useCampus();
  const names = new Map(rows.map((r) => [r.id, r.name]));
  const open = interventions
    .filter((i) => i.status !== "resolved")
    .sort((a, b) => a.follow_up_date.localeCompare(b.follow_up_date))
    .slice(0, limit);
  return (
    <div className="divide-y">
      {open.length === 0 && (
        <p className="py-2 text-sm text-muted-foreground">No open follow-ups.</p>
      )}
      {open.map((i) => (
        <div key={i.id} className="py-2 text-sm">
          <div className="flex justify-between gap-3">
            <Link
              to="/portal/students/$id"
              params={{ id: i.student_id }}
              className="font-medium text-primary hover:underline"
            >
              {names.get(i.student_id) ?? i.student_id}
            </Link>
            <span
              className={
                i.follow_up_date < today ? "font-medium text-destructive" : "text-muted-foreground"
              }
            >
              {i.follow_up_date}
              {i.follow_up_date < today ? " · overdue" : ""}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{i.action}</p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- faculty
function FacultyHome() {
  const { profile, rows, summary } = useCampus();
  const first = firstName(profile.display_name);
  if (rows.length === 0)
    return (
      <div>
        <Banner title={`Welcome, ${first}`} sub="Overview" />
        <EmptyState
          title="No students assigned to you yet"
          hint="An administrator assigns students to teachers. They will appear here as soon as they are connected to you."
        />
      </div>
    );
  return (
    <div>
      <Banner title={`Welcome, ${first}`} sub="Your students at a glance">
        <BannerStat label="Students" value={String(summary.total)} />
        <BannerStat label="Need help" value={String(summary.atRisk)} />
        <BannerStat label="Follow-ups" value={String(summary.openInterventions)} />
      </Banner>
      <OverviewHub />
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-5">
        <StatCard label="My students" value={String(summary.total)} />
        <StatCard
          label="Need help"
          value={String(summary.atRisk)}
          tone={summary.atRisk ? "danger" : "success"}
          sub="Needs attention or high priority"
        />
        <StatCard
          label="Attendance < 75%"
          value={String(summary.lowAttendance)}
          tone={summary.lowAttendance ? "warning" : "success"}
        />
        <StatCard
          label="Open follow-ups"
          value={String(summary.openInterventions)}
          sub={summary.overdueFollowUps ? `${summary.overdueFollowUps} overdue` : "none overdue"}
          tone={summary.overdueFollowUps ? "danger" : "default"}
        />
        <StatCard label="No data yet" value={String(summary.noData)} sub="Marks not recorded" />
      </div>
      <AcademicStats rows={rows} />
      <div className="mt-4 gap-4 lg:columns-2 [&>*]:mb-4 [&>*]:break-inside-avoid">
        <div className={card}>
          <SectionTitle sub="Most urgent first">Students who need attention</SectionTitle>
          <AttentionList rows={rows} empty="Everyone with data is on track." />
          <Button asChild variant="link" className="mt-2 px-0">
            <Link to="/portal/students">See all my students</Link>
          </Button>
        </div>
        <div className={card}>
          <SectionTitle sub="Soonest first">Follow-ups</SectionTitle>
          <FollowUps />
          <Button asChild variant="link" className="mt-2 px-0">
            <Link to="/portal/interventions">Manage interventions</Link>
          </Button>
        </div>
      </div>
      <CampusRiskIdentification rows={rows} />
      <FacultyInsights rows={rows} />
      <CampusInsights rows={rows} />
    </div>
  );
}

// ---------------------------------------------------------------- admin
function AdminHome() {
  const { profile, rows, summary } = useCampus();
  const first = firstName(profile.display_name);
  const branches = [...new Set(rows.map((r) => r.branch))].sort().map((b) => {
    const list = rows.filter((r) => r.branch === b);
    const scored = list.filter((r) => r.score !== null);
    return {
      branch: b,
      count: list.length,
      avg: scored.length ? scored.reduce((a, r) => a + r.score, 0) / scored.length : null,
      atRisk: list.filter(isAtRisk).length,
    };
  });
  const maxBand = Math.max(1, ...Object.values(summary.byBand));
  const segments = [
    ...rows.reduce((m, r) => m.set(r.segment, (m.get(r.segment) ?? 0) + 1), new Map()),
  ]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  return (
    <div>
      <Banner title={`Welcome, ${first}`} sub="Campus overview">
        <BannerStat label="Students" value={String(summary.total)} />
        <BannerStat
          label="Avg score"
          value={summary.avgScore === null ? "—" : String(Math.round(summary.avgScore))}
        />
        <BannerStat label="Need help" value={String(summary.atRisk)} />
      </Banner>
      <OverviewHub />
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
        <StatCard
          label="Students"
          value={String(summary.total)}
          sub={`${summary.withData} with data`}
        />
        <StatCard
          label="Need help"
          value={String(summary.atRisk)}
          tone={summary.atRisk ? "danger" : "success"}
        />
        <StatCard
          label="No teacher"
          value={String(summary.unassigned)}
          tone={summary.unassigned ? "warning" : "success"}
        />
        <StatCard
          label="Open follow-ups"
          value={String(summary.openInterventions)}
          sub={summary.overdueFollowUps ? `${summary.overdueFollowUps} overdue` : "none overdue"}
          tone={summary.overdueFollowUps ? "danger" : "default"}
        />
      </div>

      <AcademicStats rows={rows} />

      {(summary.unassigned > 0 || summary.noData > 0) && (
        <div className="mt-4 rounded-xl border border-dashed p-4 text-sm">
          <p className="font-medium">To finish setting up</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-muted-foreground">
            {summary.unassigned > 0 && (
              <li>
                {summary.unassigned} student(s) have no teacher.{" "}
                <Link to="/portal/assign" className="text-primary underline">
                  Assign them
                </Link>
              </li>
            )}
            {summary.noData > 0 && (
              <li>
                {summary.noData} student(s) have no marks or attendance yet.{" "}
                <Link to="/portal/records" className="text-primary underline">
                  Add their details
                </Link>
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="mt-4 gap-4 lg:columns-2 [&>*]:mb-4 [&>*]:break-inside-avoid">
        <div className={card}>
          <SectionTitle sub={`${summary.withData} students with data`}>
            Status of students
          </SectionTitle>
          {summary.withData === 0 && (
            <p className="text-sm text-muted-foreground">
              No scores yet. They appear as soon as student details are added.
            </p>
          )}
          <div className="space-y-3">
            {[...BAND_ORDER].reverse().map((b) => (
              <div key={b}>
                <div className="flex justify-between text-sm">
                  <span>{b}</span>
                  <span className="font-medium">{summary.byBand[b]}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${BAND_BAR[b]}`}
                    style={{ width: `${(summary.byBand[b] / maxBand) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className={card}>
          <SectionTitle sub="Most urgent first">Students who need attention</SectionTitle>
          <AttentionList rows={rows} empty="Everyone with data is on track." />
          <Button asChild variant="link" className="mt-2 px-0">
            <Link to="/portal/students">See all students</Link>
          </Button>
        </div>
        <div className={card}>
          <SectionTitle sub="Soonest first">Follow-ups</SectionTitle>
          <FollowUps />
        </div>
        <div className={card}>
          <SectionTitle sub="Groups with a shared next step">Student segments</SectionTitle>
          {segments.length === 0 && (
            <p className="text-sm text-muted-foreground">No students yet.</p>
          )}
          <ul className="space-y-1 text-sm">
            {segments.map((g) => (
              <li
                key={g.name}
                className="flex justify-between gap-3 border-t py-1.5 first:border-0"
              >
                <span>{g.name}</span>
                <span className="font-medium">{g.count}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className={card}>
          <SectionTitle sub="By branch">Branches</SectionTitle>
          {branches.length === 0 && (
            <p className="text-sm text-muted-foreground">No students yet.</p>
          )}
          {branches.length > 0 && (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1">Branch</th>
                  <th>Students</th>
                  <th>Avg score</th>
                  <th>Need help</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((b) => (
                  <tr key={b.branch} className="border-t">
                    <td className="py-1.5">{b.branch}</td>
                    <td>{b.count}</td>
                    <td>{b.avg === null ? "—" : Math.round(b.avg)}</td>
                    <td className={b.atRisk ? "text-destructive" : ""}>{b.atRisk}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <CampusRiskIdentification rows={rows} />
      <AdminAnalytics />
    </div>
  );
}
