import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { EmptyState, SectionTitle, StatCard } from "@/components/widgets";
import { PageTitle, RoleGate } from "@/components/portal/PortalShell";
import { componentScores, lmsParts, pendingAssignments, studentAttendancePct } from "@/lib/scoring";
import { useCampus } from "@/lib/use-campus";

// Staff view of one data category across the students they can see. Each category lists the
// indicators the brief names, the weakest students first, and a year-by-year comparison.

const dash = "—";
const num = (v, d = 0) => (v === null || v === undefined || Number.isNaN(v) ? dash : v.toFixed(d));
const pct = (v) => (v === null || v === undefined ? dash : `${v.toFixed(0)}%`);
const known = (v) => (v >= 0 ? String(v) : dash);
const count = (s, type) => s.engagement.filter((e) => e.type === type).length;
const marksAvg = (s) =>
  s.subjects.length ? s.subjects.reduce((a, x) => a + x.marks, 0) / s.subjects.length : null;
const subjectsUnder75 = (s) =>
  s.subjects.filter((x) => x.classesHeld > 0 && x.classesAttended / x.classesHeld < 0.75);
const weakest = (s) =>
  s.subjects.length ? s.subjects.reduce((a, b) => (b.marks < a.marks ? b : a)).subject : dash;

export const CATEGORIES = {
  academic: {
    title: "Academic",
    sub: "CGPA, marks, backlogs and subject performance",
    main: {
      label: "Average CGPA",
      get: (s) => (s.cgpa > 0 ? s.cgpa : null),
      d: 2,
      bad: (v) => v < 6,
    },
    cols: [
      ["CGPA", (s) => (s.cgpa > 0 ? s.cgpa.toFixed(2) : dash)],
      ["Avg marks", (s) => num(marksAvg(s), 0)],
      ["Backlogs", (s) => String(s.backlogs)],
      ["Weakest subject", weakest],
    ],
  },
  attendance: {
    title: "Attendance",
    sub: "Overall % and subject-wise attendance",
    main: {
      label: "Average attendance",
      get: studentAttendancePct,
      d: 1,
      unit: "%",
      bad: (v) => v < 75,
    },
    cols: [
      ["Overall", (s) => pct(studentAttendancePct(s))],
      ["Subjects under 75%", (s) => (s.subjects.length ? String(subjectsUnder75(s).length) : dash)],
      [
        "Lowest subject",
        (s) => {
          const low = s.subjects
            .filter((x) => x.classesHeld > 0)
            .sort(
              (a, b) => a.classesAttended / a.classesHeld - b.classesAttended / b.classesHeld,
            )[0];
          return low
            ? `${low.subject} ${((low.classesAttended / low.classesHeld) * 100).toFixed(0)}%`
            : dash;
        },
      ],
    ],
  },
  lms: {
    title: "LMS",
    sub: "Login frequency and assignment completion",
    main: {
      label: "Average assignment completion",
      get: (s) => lmsParts(s).assignmentPct,
      d: 0,
      unit: "%",
      bad: (v) => v < 60,
    },
    cols: [
      ["Logins / week", (s) => num(s.lmsLoginsPerWeek, 1)],
      ["Lessons done", (s) => pct(lmsParts(s).lessonsPct)],
      ["Assignments done", (s) => pct(lmsParts(s).assignmentPct)],
      ["Pending", (s) => (s.lms.length ? String(pendingAssignments(s).length) : dash)],
    ],
  },
  engagement: {
    title: "Engagement",
    sub: "Events, clubs, hackathons and certifications",
    main: {
      label: "Average engagement score",
      get: (s) => componentScores(s).engagement,
      d: 0,
      bad: (v) => v < 20,
    },
    cols: [
      ["Events", (s) => String(count(s, "event"))],
      ["Clubs", (s) => String(count(s, "club"))],
      ["Hackathons", (s) => String(count(s, "hackathon"))],
      ["Certifications", (s) => String(count(s, "certification"))],
    ],
  },
  placement: {
    title: "Placement",
    sub: "Aptitude score, coding score and mock interviews",
    main: {
      label: "Average placement readiness",
      get: (s) => componentScores(s).placement,
      d: 0,
      bad: (v) => v < 60,
    },
    cols: [
      ["Aptitude", (s) => known(s.skills.aptitude)],
      ["Coding", (s) => known(s.skills.coding)],
      [
        "Mock interviews",
        (s) => (s.mockInterviews === undefined ? dash : String(s.mockInterviews)),
      ],
      ["Resume", (s) => (s.resumeCompleteness >= 0 ? `${s.resumeCompleteness}%` : dash)],
      [
        "Assessments",
        (s) =>
          s.assessmentsRequired ? `${s.assessmentsCompleted}/${s.assessmentsRequired}` : dash,
      ],
    ],
  },
  skills: {
    title: "Skills",
    sub: "Technical and soft-skill assessments",
    main: {
      label: "Average skills score",
      get: (s) => componentScores(s).skills,
      d: 0,
      bad: (v) => v < 55,
    },
    cols: [
      ["Coding", (s) => known(s.skills.coding)],
      ["Aptitude", (s) => known(s.skills.aptitude)],
      ["Analytical", (s) => known(s.skills.analytical)],
      ["Verbal", (s) => known(s.skills.verbal)],
      ["Communication", (s) => known(s.skills.communication)],
    ],
  },
  feedback: {
    title: "Feedback",
    sub: "Student satisfaction and faculty feedback",
    main: {
      label: "Average satisfaction (of 5)",
      get: (s) => s.satisfaction ?? null,
      d: 1,
      bad: (v) => v < 3,
    },
    cols: [
      ["Satisfaction", (s) => num(s.satisfaction, 1)],
      ["Faculty feedback", (s) => String(s.facultyFeedback.length)],
      ["Student feedback", (s) => String(s.studentFeedback.length)],
      ["Latest faculty note", (s) => s.facultyFeedback.at(-1)?.note.slice(0, 60) ?? dash],
    ],
  },
};

const mean = (v) => (v.length ? v.reduce((a, c) => a + c, 0) / v.length : null);
const selectClass = "rounded-md border bg-background p-2 text-sm";

function CategoryBody({ category, embedded = false }) {
  const cfg = CATEGORIES[category];
  const { rows } = useCampus();
  const [year, setYear] = useState(0);
  const [course, setCourse] = useState("");
  const [section, setSection] = useState("");
  const [gender, setGender] = useState("");
  const distinct = (key) => [...new Set(rows.map((r) => r[key]).filter(Boolean))].sort();
  const shown = useMemo(() => {
    const keep = rows.filter(
      (r) =>
        (!year || r.year === year) &&
        (!course || r.course === course) &&
        (!section || r.section === section) &&
        (!gender || r.gender === gender),
    );
    // Weakest first; students with nothing recorded go last.
    return keep
      .map((r) => ({ r, v: cfg.main.get(r.s) }))
      .sort((a, b) => (a.v ?? Infinity) - (b.v ?? Infinity));
  }, [rows, year, course, section, gender, cfg]);
  const values = shown.map((x) => x.v).filter((v) => v !== null);
  const flagged = values.filter(cfg.main.bad).length;
  const byYear = [1, 2, 3, 4].map((y) => {
    const v = rows
      .filter((r) => r.year === y)
      .map((r) => cfg.main.get(r.s))
      .filter((x) => x !== null);
    return { y, n: v.length, avg: mean(v) };
  });
  const select = (value, set, label, options) =>
    options.length > 1 && (
      <select
        value={value}
        onChange={(e) => set(e.target.value)}
        aria-label={`Filter by ${label}`}
        className={selectClass}
      >
        <option value="">All {label}s</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  return (
    <>
      {!embedded && <PageTitle title={cfg.title} sub={cfg.sub} />}
      {rows.length === 0 ? (
        <EmptyState title="No students yet" hint="Import students from the Students page." />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Students shown" value={String(shown.length)} />
            <StatCard
              label={cfg.main.label}
              value={
                values.length ? `${num(mean(values), cfg.main.d)}${cfg.main.unit ?? ""}` : dash
              }
            />
            <StatCard
              label="Below the healthy level"
              value={String(flagged)}
              tone={flagged ? "danger" : "success"}
            />
            <StatCard label="No data recorded" value={String(shown.length - values.length)} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {[0, 1, 2, 3, 4].map((y) => (
              <Button
                key={y}
                type="button"
                size="sm"
                variant={year === y ? "default" : "outline"}
                onClick={() => setYear(y)}
              >
                {y === 0 ? "All years" : `Year ${y}`}
              </Button>
            ))}
            {select(course, setCourse, "course", distinct("course"))}
            {select(section, setSection, "section", distinct("section"))}
            {select(gender, setGender, "gender", distinct("gender"))}
          </div>
          <div className="surface p-4">
            <SectionTitle sub={`${cfg.main.label} for each year of study`}>
              Year by year
            </SectionTitle>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {byYear.map((b) => (
                <div key={b.y} className="rounded-lg border p-3 text-sm">
                  <p className="text-muted-foreground">Year {b.y}</p>
                  <p
                    className={`text-xl font-semibold ${b.avg !== null && cfg.main.bad(b.avg) ? "text-destructive" : ""}`}
                  >
                    {b.avg === null ? dash : `${num(b.avg, cfg.main.d)}${cfg.main.unit ?? ""}`}
                  </p>
                  <p className="text-xs text-muted-foreground">{b.n} with data</p>
                </div>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto surface">
            <table className="w-full whitespace-nowrap text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-3">Student</th>
                  <th>Year · Section</th>
                  {cfg.cols.map(([label]) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, 200).map(({ r, v }) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="p-3">
                      <Link
                        to="/portal/students/$id"
                        params={{ id: r.id }}
                        className="font-medium text-primary hover:underline"
                      >
                        {r.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{r.id}</span>
                    </td>
                    <td className="text-xs">
                      Year {r.year}
                      {r.section && ` · ${r.section}`}
                    </td>
                    {cfg.cols.map(([label, get], i) => (
                      <td
                        key={label}
                        className={
                          i === 0 && v !== null && cfg.main.bad(v)
                            ? "font-medium text-destructive"
                            : ""
                        }
                      >
                        {get(r.s)}
                      </td>
                    ))}
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr>
                    <td
                      colSpan={cfg.cols.length + 2}
                      className="p-6 text-center text-muted-foreground"
                    >
                      No students match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

/** Staff page for one category. Students keep their own pages, so this renders only for staff. */
export function StaffCategory({ category, embedded = false }) {
  return (
    <RoleGate allow={["faculty", "admin"]}>
      <CategoryBody category={category} embedded={embedded} />
    </RoleGate>
  );
}
