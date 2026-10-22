import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Calculator, Printer } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { EmptyState, SectionTitle, StatCard } from "@/components/widgets";
import { ErrorState, useAction } from "@/components/ui-kit";
import { PageTitle } from "@/components/portal/PortalShell";
import { DEFAULT_CREDITS, semesterResult } from "@/lib/grades";
import { recalculateGrades } from "@/lib/platform.functions";
import { useCampus } from "@/lib/use-campus";
import { useLms, useRefreshAll } from "@/lib/use-platform";

const PASS_MARK = 40;
// Marks out of 100 to a letter grade. A teacher's own scale can replace this later.
export function gradeOf(marks) {
  if (marks >= 90) return "O";
  if (marks >= 80) return "A+";
  if (marks >= 70) return "A";
  if (marks >= 60) return "B+";
  if (marks >= 50) return "B";
  if (marks >= PASS_MARK) return "C";
  return "F";
}
const tip = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--popover-foreground)",
};
const mean = (v) => (v.length ? v.reduce((a, c) => a + c, 0) / v.length : null);

// ---------------------------------------------------------------- student
function StudentResults() {
  const { myRow } = useCampus();
  if (!myRow)
    return (
      <>
        <PageTitle title="Academic results" sub="Your marks, grades and CGPA" />
        <EmptyState
          title="No student record is linked to your account yet"
          hint="Your results appear here once an administrator links your record and your teacher adds your marks."
        />
      </>
    );
  const s = myRow.s;
  const sgpa = s.semesterGrades.map((g, i) => ({ sem: `Sem ${i + 1}`, sgpa: g }));
  const passed = s.subjects.filter((x) => x.marks >= PASS_MARK).length;
  const latest = sgpa.at(-1)?.sgpa;
  return (
    <>
      <PageTitle title="Academic results" sub={`${s.name} · ${s.id} · ${s.branch}`}>
        <Button variant="outline" onClick={() => window.print()} className="print:hidden">
          <Printer /> Print or save as PDF
        </Button>
      </PageTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="CGPA" value={s.cgpa > 0 ? s.cgpa.toFixed(2) : "—"} sub="out of 10" />
        <StatCard label="Latest SGPA" value={latest === undefined ? "—" : latest.toFixed(2)} />
        <StatCard
          label="Backlogs"
          value={String(s.backlogs)}
          tone={s.backlogs ? "danger" : "success"}
          sub={s.backlogs ? "Clear in the next re-exam" : "None"}
        />
        <StatCard
          label="Subjects passed"
          value={s.subjects.length ? `${passed} / ${s.subjects.length}` : "—"}
        />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="surface p-4">
          <SectionTitle sub="Semester grade point average">SGPA by semester</SectionTitle>
          {sgpa.length === 0 ? (
            <p className="text-sm text-muted-foreground">No semester grades recorded yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={sgpa}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="sem" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis domain={[0, 10]} stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip contentStyle={tip} />
                <Bar
                  isAnimationActive={false}
                  dataKey="sgpa"
                  name="SGPA"
                  fill="var(--primary)"
                  radius={[8, 8, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="surface p-4">
          <SectionTitle sub="Current semester, out of 100">Marks by subject</SectionTitle>
          {s.subjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No marks recorded yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={s.subjects} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                />
                <YAxis
                  type="category"
                  dataKey="subject"
                  width={120}
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                />
                <Tooltip contentStyle={tip} />
                <Bar isAnimationActive={false} dataKey="marks" name="Marks" radius={[0, 8, 8, 0]}>
                  {s.subjects.map((x) => (
                    <Cell
                      key={x.subject}
                      fill={x.marks >= PASS_MARK ? "var(--primary)" : "var(--destructive)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
      {s.subjects.length > 0 && (
        <div className="surface mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="p-3">Subject</th>
                <th>Marks</th>
                <th>Grade</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {[...s.subjects]
                .sort((a, b) => b.marks - a.marks)
                .map((x) => (
                  <tr key={x.subject} className="border-t">
                    <td className="p-3 font-medium">{x.subject}</td>
                    <td className="tabular-nums">{x.marks}</td>
                    <td className="font-display font-bold">{gradeOf(x.marks)}</td>
                    <td className={x.marks >= PASS_MARK ? "text-success" : "text-destructive"}>
                      {x.marks >= PASS_MARK ? "Pass" : "Re-exam needed"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      <SgpaWorkings s={s} />
      <p className="mt-3 text-xs text-muted-foreground">
        Grades follow a standard scale (O ≥ 90, A+ ≥ 80, A ≥ 70, B+ ≥ 60, B ≥ 50, C ≥ 40, F below
        40). Your university's official result sheet is the final record.
      </p>
    </>
  );
}

/**
 * Where the current semester's SGPA comes from: every subject with marks, the grade those
 * marks earn and the credits they carry. Credits come from the subject's published syllabus.
 */
function SgpaWorkings({ s }) {
  const { data: lms, isLoading } = useLms();
  const credits = new Map(
    (lms?.subjects ?? [])
      .filter((x) => Number(x.syllabus?.credits) > 0)
      .map((x) => [x.subject, Number(x.syllabus.credits)]),
  );
  // Said only once the syllabus has actually been read, never while it is still loading.
  const unpublished = !isLoading && credits.size === 0;
  const result = semesterResult(s.subjects, (subject) => credits.get(subject) ?? DEFAULT_CREDITS);
  if (result.sgpa === null) return null;
  return (
    <section className="surface mt-4 p-4" aria-label="How the SGPA is worked out">
      <SectionTitle sub="Credit-weighted average of the grade points your marks earn">
        How this semester's SGPA is worked out
      </SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-2">Subject</th>
              <th className="p-2">Marks</th>
              <th className="p-2">Grade</th>
              <th className="p-2">Grade points</th>
              <th className="p-2">Credits</th>
              <th className="p-2">Points × credits</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => (
              <tr key={r.subject} className="border-t">
                <td className="p-2 font-medium">{r.subject}</td>
                <td className="p-2 tabular-nums">{r.marks}</td>
                <td className="p-2 font-display font-bold">{r.letter}</td>
                <td className="p-2 tabular-nums">{r.points}</td>
                <td className="p-2 tabular-nums">{r.credits}</td>
                <td className="p-2 tabular-nums">{r.points * r.credits}</td>
              </tr>
            ))}
            <tr className="border-t font-medium">
              <td className="p-2">Total</td>
              <td />
              <td />
              <td />
              <td className="p-2 tabular-nums">{result.credits}</td>
              <td className="p-2 tabular-nums">{result.weighted}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-sm">
        SGPA = {result.weighted} ÷ {result.credits} ={" "}
        <b className="tabular-nums">{result.sgpa.toFixed(2)}</b>. CGPA is the average of your
        semester SGPAs.
      </p>
      {result.failed.length > 0 && (
        <p className="mt-1 text-sm text-destructive">
          No grade points for {result.failed.join(", ")} — below the pass mark, so these pull the
          SGPA down until cleared.
        </p>
      )}
      {unpublished && (
        <p className="mt-1 text-xs text-muted-foreground">
          No syllabus credits are published for these subjects yet, so each counts as{" "}
          {DEFAULT_CREDITS} credits.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- teachers and administrators
const BUCKETS = [
  ["Below 5", (c) => c < 5],
  ["5 – 6", (c) => c >= 5 && c < 6],
  ["6 – 7", (c) => c >= 6 && c < 7],
  ["7 – 8", (c) => c >= 7 && c < 8],
  ["8 – 9", (c) => c >= 8 && c < 9],
  ["9 and above", (c) => c >= 9],
];
const BUCKET_COLOR = [
  "var(--destructive)",
  "var(--warning)",
  "var(--chart-3)",
  "var(--info)",
  "var(--chart-2)",
  "var(--success)",
];

function StudentLink({ r }) {
  return (
    <Link
      to="/portal/students/$id"
      params={{ id: r.id }}
      className="font-medium text-primary hover:underline"
    >
      {r.name}
    </Link>
  );
}

/** Brings every student's SGPA and CGPA back in line with the marks on their record. */
function RecalculateGrades() {
  const refresh = useRefreshAll();
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const { busy, run } = useAction(refresh);
  return (
    <div className="print:hidden">
      <Button
        variant="outline"
        disabled={busy}
        onClick={() =>
          run(async () => {
            setError(null);
            try {
              setResult(await recalculateGrades({ data: { studentId: null } }));
            } catch (e) {
              setError(e);
              throw e;
            }
          }, "Results recalculated from the marks on record.")
        }
      >
        <Calculator /> Update SGPA and CGPA from marks
      </Button>
      {error && <ErrorState error={error} />}
      {result && (
        <p className="mt-2 max-w-sm text-xs text-muted-foreground">
          {result.changed.length} of {result.considered} students updated
          {result.skipped.length > 0 &&
            ` · ${result.skipped.length} left alone (no marks recorded)`}
          .
        </p>
      )}
    </div>
  );
}

function ClassResults() {
  const { rows, isAdmin } = useCampus();
  const graded = rows.filter((r) => r.cgpa !== null);
  const avg = mean(graded.map((r) => r.cgpa));
  const backlog = rows.filter((r) => r.s.backlogs > 0);
  const low = graded.filter((r) => r.cgpa < 6);
  const top = [...graded].sort((a, b) => b.cgpa - a.cgpa).slice(0, 8);
  const support = [...rows]
    .filter((r) => r.s.backlogs > 0 || (r.cgpa !== null && r.cgpa < 6))
    .sort((a, b) => b.s.backlogs - a.s.backlogs || (a.cgpa ?? 0) - (b.cgpa ?? 0))
    .slice(0, 10);
  const dist = BUCKETS.map(([name, fn]) => ({
    name,
    count: graded.filter((r) => fn(r.cgpa)).length,
  }));
  return (
    <>
      <PageTitle
        title={isAdmin ? "Campus results" : "Class results"}
        sub="CGPA, backlogs and who is leading or needs help"
      >
        <RecalculateGrades />
      </PageTitle>
      {rows.length === 0 ? (
        <EmptyState title="No students yet" hint="Results appear once students are assigned." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Average CGPA" value={avg === null ? "—" : avg.toFixed(2)} />
            <StatCard
              label="Highest CGPA"
              value={top[0] ? top[0].cgpa.toFixed(2) : "—"}
              sub={top[0]?.name}
            />
            <StatCard
              label="With backlogs"
              value={String(backlog.length)}
              tone={backlog.length ? "danger" : "success"}
            />
            <StatCard
              label="CGPA below 6"
              value={String(low.length)}
              tone={low.length ? "warning" : "success"}
            />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="surface p-4">
              <SectionTitle sub="Students per CGPA range">CGPA distribution</SectionTitle>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={dist}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis allowDecimals={false} stroke="var(--muted-foreground)" fontSize={12} />
                  <Tooltip contentStyle={tip} />
                  <Bar
                    isAnimationActive={false}
                    dataKey="count"
                    name="Students"
                    radius={[8, 8, 0, 0]}
                  >
                    {dist.map((d, i) => (
                      <Cell key={d.name} fill={BUCKET_COLOR[i]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="surface p-4">
              <SectionTitle sub="Highest CGPA first">Top performers</SectionTitle>
              {top.map((r, i) => (
                <div key={r.id} className="flex items-center justify-between border-t py-2 text-sm">
                  <span>
                    <span className="mr-2 text-muted-foreground tabular-nums">{i + 1}</span>
                    <StudentLink r={r} />
                    <span className="ml-2 text-xs text-muted-foreground">
                      {r.branch} · Sem {r.semester}
                    </span>
                  </span>
                  <span className="font-display font-bold tabular-nums">{r.cgpa.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="surface mt-4 overflow-x-auto">
            <div className="p-4 pb-0">
              <SectionTitle sub="Backlogs first, then lowest CGPA">
                Students who need academic support
              </SectionTitle>
            </div>
            {support.length === 0 ? (
              <p className="p-4 text-sm text-success">No backlogs and nobody below CGPA 6.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="p-3">Student</th>
                    <th>Branch</th>
                    <th>CGPA</th>
                    <th>Backlogs</th>
                    <th>Attendance</th>
                  </tr>
                </thead>
                <tbody>
                  {support.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-3">
                        <StudentLink r={r} />
                        <span className="block text-xs text-muted-foreground">{r.id}</span>
                      </td>
                      <td>{r.branch}</td>
                      <td className="tabular-nums">{r.cgpa === null ? "—" : r.cgpa.toFixed(2)}</td>
                      <td className={r.s.backlogs ? "font-medium text-destructive" : ""}>
                        {r.s.backlogs}
                      </td>
                      <td className="tabular-nums">
                        {r.attendance === null ? "—" : `${r.attendance.toFixed(1)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </>
  );
}

export function ResultsPage() {
  const { role } = useCampus();
  return role === "student" ? <StudentResults /> : <ClassResults />;
}
