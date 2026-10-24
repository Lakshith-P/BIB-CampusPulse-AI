import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3 } from "lucide-react";
import { EmptyState, SectionTitle, StatCard } from "@/components/widgets";
import { BAND_ORDER, averages, isAtRisk } from "@/lib/campus-derive";
import { componentScores, lmsCompletion, studentAttendancePct, successScore } from "@/lib/scoring";
import { DEFAULT_WEIGHTS } from "@/lib/types";
import { useCampus } from "@/lib/use-campus";

// Report tiles on the profile page, in the shape of the Power BI report the campus runs on this
// same data: a KPI row and charts per subject, semester and indicator. Every figure comes from
// the records in the database; where nothing is recorded, the tile says so rather than plotting a
// zero.

const card = "surface p-4";
const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--popover-foreground)",
};
const BAND_FILL = {
  "On Track": "var(--success)",
  Monitor: "var(--info)",
  "Needs Attention": "var(--warning)",
  "High Priority": "var(--destructive)",
};
const fmt = (v, d = 0, suffix = "") =>
  v === null || v === undefined ? "—" : v.toFixed(d) + suffix;
const LABELS = {
  academics: "Academics",
  attendance: "Attendance",
  lms: "LMS",
  engagement: "Engagement",
  skills: "Skills",
  placement: "Placement",
};

function Tile({ label, sub, children, empty }) {
  return (
    <section className={card} aria-label={label}>
      <SectionTitle sub={sub}>{label}</SectionTitle>
      {empty ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="h-56" role="img" aria-label={label}>
          <ResponsiveContainer>{children}</ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function Frame({ children, sub }) {
  return (
    <section className="mt-4" aria-label="Power BI dashboards">
      <SectionTitle sub={sub}>
        <span className="inline-flex items-center gap-2">
          <BarChart3 className="size-4 text-primary" /> Power BI dashboards
        </span>
      </SectionTitle>
      {children}
    </section>
  );
}

/** The student's own report: their marks, attendance, skills and score components. */
function StudentDashboards({ s }) {
  const r = successScore(s);
  const c = componentScores(s);
  const attendance = s.subjects
    .filter((x) => x.classesHeld > 0)
    .map((x) => ({
      subject: x.subject,
      value: (x.classesAttended / x.classesHeld) * 100,
    }));
  const marks = s.subjects.map((x) => ({ subject: x.subject, value: x.marks }));
  const semesters = s.semesterGrades.map((g, i) => ({ name: `Sem ${i + 1}`, value: g }));
  const skills = Object.entries(s.skills)
    .filter(([, v]) => v >= 0)
    .map(([name, value]) => ({ name: name[0].toUpperCase() + name.slice(1), value }));
  const components = Object.entries(c)
    .filter(([, v]) => v !== null)
    .map(([key, value]) => ({ name: LABELS[key], value, weight: DEFAULT_WEIGHTS[key] }));
  return (
    <Frame sub="Your own record, as the campus report reads it">
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-5">
        <StatCard label="Success score" value={fmt(r.score, 0)} sub="/100" />
        <StatCard label="CGPA" value={s.cgpa > 0 ? s.cgpa.toFixed(2) : "—"} />
        <StatCard
          label="Attendance"
          value={fmt(studentAttendancePct(s), 1, "%")}
          tone={c.attendance !== null && c.attendance < 75 ? "danger" : "default"}
        />
        <StatCard label="LMS completion" value={fmt(lmsCompletion(s), 0, "%")} />
        <StatCard label="Placement readiness" value={fmt(c.placement, 0, "%")} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Tile
          label="Attendance by subject"
          sub="The line marks the 75% requirement"
          empty={attendance.length ? null : "No classes have been recorded yet."}
        >
          <BarChart data={attendance}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="subject" fontSize={11} stroke="var(--muted-foreground)" />
            <YAxis domain={[0, 100]} fontSize={11} stroke="var(--muted-foreground)" />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v.toFixed(1)}%`} />
            <ReferenceLine y={75} stroke="var(--warning)" strokeDasharray="4 4" />
            <Bar
              dataKey="value"
              name="Attendance %"
              isAnimationActive={false}
              radius={[6, 6, 0, 0]}
            >
              {attendance.map((a) => (
                <Cell
                  key={a.subject}
                  fill={a.value < 75 ? "var(--destructive)" : "var(--success)"}
                />
              ))}
            </Bar>
          </BarChart>
        </Tile>
        <Tile
          label="Marks by subject"
          sub="Latest recorded internal marks"
          empty={marks.length ? null : "No marks have been recorded yet."}
        >
          <BarChart data={marks}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="subject" fontSize={11} stroke="var(--muted-foreground)" />
            <YAxis domain={[0, 100]} fontSize={11} stroke="var(--muted-foreground)" />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar
              dataKey="value"
              name="Marks"
              fill="var(--primary)"
              isAnimationActive={false}
              radius={[6, 6, 0, 0]}
            />
          </BarChart>
        </Tile>
        <Tile
          label="SGPA by semester"
          sub="Each semester as it was recorded"
          empty={semesters.length ? null : "No semester results have been recorded yet."}
        >
          <LineChart data={semesters}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" fontSize={11} stroke="var(--muted-foreground)" />
            <YAxis domain={[0, 10]} fontSize={11} stroke="var(--muted-foreground)" />
            <Tooltip contentStyle={tooltipStyle} />
            <Line
              dataKey="value"
              name="SGPA"
              stroke="var(--primary)"
              strokeWidth={2}
              isAnimationActive={false}
            />
          </LineChart>
        </Tile>
        <Tile
          label="Assessed skills"
          sub="Average of your three most recent tests per skill"
          empty={skills.length ? null : "No skill assessment has been recorded yet."}
        >
          <BarChart data={skills}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" fontSize={11} stroke="var(--muted-foreground)" />
            <YAxis domain={[0, 100]} fontSize={11} stroke="var(--muted-foreground)" />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="value" name="Score" isAnimationActive={false} radius={[6, 6, 0, 0]}>
              {skills.map((x) => (
                <Cell key={x.name} fill={x.value < 50 ? "var(--warning)" : "var(--info)"} />
              ))}
            </Bar>
          </BarChart>
        </Tile>
        <Tile
          label="Score components"
          sub="Each indicator out of 100, with the weight it carries"
          empty={components.length ? null : "Your score appears once any indicator is recorded."}
        >
          <BarChart data={components} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis type="number" domain={[0, 100]} fontSize={11} stroke="var(--muted-foreground)" />
            <YAxis type="category" dataKey="name" width={88} fontSize={11} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v, _n, p) => [`${v.toFixed(0)} / 100`, `weight ${p.payload.weight}%`]}
            />
            <Bar
              dataKey="value"
              name="Score"
              fill="var(--primary)"
              isAnimationActive={false}
              radius={[0, 6, 6, 0]}
            />
          </BarChart>
        </Tile>
      </div>
      {r.missing.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Not recorded yet, so left out of every tile: {r.missing.map((m) => LABELS[m]).join(", ")}.
        </p>
      )}
    </Frame>
  );
}

/** The campus report for teachers and administrators, over the students they can see. */
function StaffDashboards({ rows, isAdmin }) {
  const a = averages(rows);
  const bands = [...BAND_ORDER].reverse().map((band) => ({
    band,
    count: rows.filter((r) => r.band === band).length,
  }));
  const branches = [...new Set(rows.map((r) => r.branch))].sort().map((branch) => {
    const list = rows.filter((r) => r.branch === branch);
    const scored = list.filter((r) => r.score !== null);
    return {
      branch,
      value: scored.length ? scored.reduce((x, r) => x + r.score, 0) / scored.length : 0,
      atRisk: list.filter(isAtRisk).length,
    };
  });
  const risk = ["High", "Medium", "Low", "Insufficient data"].map((level) => ({
    level,
    academic: rows.filter((r) => r.academicRisk === level).length,
    placement: rows.filter((r) => r.placementRisk === level).length,
  }));
  return (
    <Frame sub={isAdmin ? "Every student on the campus record" : "The students assigned to you"}>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-5">
        <StatCard label="Students" value={String(rows.length)} />
        <StatCard label="Avg success score" value={fmt(a.avgScore, 1)} sub="/100" />
        <StatCard label="Avg CGPA" value={fmt(a.avgCgpa, 2)} />
        <StatCard
          label="Avg attendance"
          value={fmt(a.avgAtt, 1, "%")}
          tone={a.avgAtt !== null && a.avgAtt < 75 ? "danger" : "default"}
        />
        <StatCard label="Avg placement readiness" value={fmt(a.avgPlace, 1, "%")} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Tile label="Students by band" sub="From the recorded success scores">
          <BarChart data={bands}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="band" fontSize={11} stroke="var(--muted-foreground)" />
            <YAxis allowDecimals={false} fontSize={11} stroke="var(--muted-foreground)" />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="count" name="Students" isAnimationActive={false} radius={[6, 6, 0, 0]}>
              {bands.map((b) => (
                <Cell key={b.band} fill={BAND_FILL[b.band]} />
              ))}
            </Bar>
          </BarChart>
        </Tile>
        <Tile label="Average score by branch" sub="Branches with at least one scored student">
          <BarChart data={branches}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="branch" fontSize={11} stroke="var(--muted-foreground)" />
            <YAxis domain={[0, 100]} fontSize={11} stroke="var(--muted-foreground)" />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => v.toFixed(1)} />
            <Bar
              dataKey="value"
              name="Avg score"
              fill="var(--primary)"
              isAnimationActive={false}
              radius={[6, 6, 0, 0]}
            />
          </BarChart>
        </Tile>
        <Tile label="Risk levels" sub="Academic and placement flags side by side">
          <BarChart data={risk}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="level" fontSize={11} stroke="var(--muted-foreground)" />
            <YAxis allowDecimals={false} fontSize={11} stroke="var(--muted-foreground)" />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar
              dataKey="academic"
              name="Academic"
              fill="var(--warning)"
              isAnimationActive={false}
              radius={[6, 6, 0, 0]}
            />
            <Bar
              dataKey="placement"
              name="Placement"
              fill="var(--info)"
              isAnimationActive={false}
              radius={[6, 6, 0, 0]}
            />
          </BarChart>
        </Tile>
        <Tile label="Data coverage" sub="How much of each student's record is filled in">
          <BarChart
            data={[
              { name: "Recorded", value: a.cells - a.missing },
              { name: "Not recorded", value: a.missing },
            ]}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" fontSize={11} stroke="var(--muted-foreground)" />
            <YAxis allowDecimals={false} fontSize={11} stroke="var(--muted-foreground)" />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="value" name="Indicators" isAnimationActive={false} radius={[6, 6, 0, 0]}>
              <Cell fill="var(--success)" />
              <Cell fill="var(--muted-foreground)" />
            </Bar>
          </BarChart>
        </Tile>
      </div>
    </Frame>
  );
}

/** The report tiles for whoever is signed in, on their profile page. */
export function PowerBiDashboards() {
  const { role, rows, myRow, isAdmin } = useCampus();
  if (role === "student") {
    if (!myRow)
      return (
        <Frame sub="Your report fills in once your record is linked">
          <EmptyState
            title="No report yet"
            hint="An administrator links your student record to your account; your tiles appear then."
          />
        </Frame>
      );
    return <StudentDashboards s={myRow.s} />;
  }
  if (!rows.length)
    return (
      <Frame sub="Your report fills in once students are assigned to you">
        <EmptyState
          title="No students yet"
          hint="These tiles are built from the students you can see."
        />
      </Frame>
    );
  return <StaffDashboards rows={rows} isAdmin={isAdmin} />;
}
