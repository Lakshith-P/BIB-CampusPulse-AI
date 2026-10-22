import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BandBadge, SectionTitle } from "@/components/widgets";
import { studentsToCsv } from "@/lib/csv";
import { BAND_ORDER, byAttention, lowAttendance } from "@/lib/campus-derive";

const selectClass = "rounded-md border bg-background p-2 text-sm";
const LIMIT = 200;
const LEVELS = ["Low", "Medium", "High"];
const LEVEL_CLASS = {
  High: "bg-destructive/15 text-destructive",
  Medium: "bg-warning/15 text-warning",
  Low: "bg-success/15 text-success",
};
function LevelPill({ level, points }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${LEVEL_CLASS[level]}`}>
      {level}
      {points !== undefined && ` · ${points}`}
    </span>
  );
}

const distinct = (rows, key) => [...new Set(rows.map((r) => r[key]).filter(Boolean))].sort();
const subjectBy = (s, pick) =>
  s.subjects.length ? s.subjects.reduce((a, b) => (pick(b, a) ? b : a)).subject : "—";
const COMPARE_ROWS = [
  ["Score", (r) => (r.score === null ? "—" : Math.round(r.score))],
  ["CGPA", (r) => (r.cgpa === null ? "—" : r.cgpa.toFixed(2))],
  ["Attendance", (r) => pct(r.attendance)],
  ["LMS", (r) => pct(r.lms)],
  ["Backlogs", (r) => r.s.backlogs],
  ["Coding", (r) => r.s.skills.coding],
  ["Aptitude", (r) => r.s.skills.aptitude],
  ["Communication", (r) => r.s.skills.communication],
  ["Best subject", (r) => subjectBy(r.s, (b, a) => b.marks > a.marks)],
  ["Weakest subject", (r) => subjectBy(r.s, (b, a) => b.marks < a.marks)],
];
export const pct = (v) => (v === null ? "—" : `${v.toFixed(v >= 99.95 ? 0 : 1)}%`);

/** A searchable, filterable list of students. Click a row's name to open the student. */
export function StudentTable({ rows, showMentor = false, initialFilter = "" }) {
  const [q, setQ] = useState("");
  const [band, setBand] = useState(initialFilter);
  const [branch, setBranch] = useState("");
  const [mentor, setMentor] = useState("");
  const [segment, setSegment] = useState("");
  const [acad, setAcad] = useState("");
  const [place, setPlace] = useState("");
  const [compare, setCompare] = useState([]);
  const [year, setYear] = useState(0);
  const [course, setCourse] = useState("");
  const [section, setSection] = useState("");
  const [gender, setGender] = useState("");
  const courses = useMemo(() => distinct(rows, "course"), [rows]);
  const sections = useMemo(() => distinct(rows, "section"), [rows]);
  const genders = useMemo(() => distinct(rows, "gender"), [rows]);
  const yearCounts = useMemo(() => {
    const c = {};
    for (const r of rows) c[r.year] = (c[r.year] ?? 0) + 1;
    return c;
  }, [rows]);
  const branches = useMemo(() => [...new Set(rows.map((r) => r.branch))].sort(), [rows]);
  const segments = useMemo(() => [...new Set(rows.map((r) => r.segment))].sort(), [rows]);
  const mentors = useMemo(() => {
    const m = new Map();
    for (const r of rows) if (r.mentorId) m.set(r.mentorId, r.mentorName || r.mentorEmail);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return byAttention(
      rows.filter((r) => {
        if (needle && !`${r.name} ${r.id} ${r.ownerEmail}`.toLowerCase().includes(needle))
          return false;
        if (branch && r.branch !== branch) return false;
        if (year && r.year !== year) return false;
        if (course && r.course !== course) return false;
        if (section && r.section !== section) return false;
        if (gender && r.gender !== gender) return false;
        if (segment && r.segment !== segment) return false;
        if (acad && r.academicRisk !== acad) return false;
        if (place && r.placementRisk !== place) return false;
        if (mentor === "none" && r.mentorId) return false;
        if (mentor && mentor !== "none" && r.mentorId !== mentor) return false;
        if (band === "nodata") return r.score === null;
        if (band === "lowatt") return lowAttendance(r);
        if (band === "atrisk") return r.band === "High Priority" || r.band === "Needs Attention";
        if (band) return r.band === band;
        return true;
      }),
    );
  }, [rows, q, band, branch, mentor, segment, acad, place, year, course, section, gender]);
  const compared = compare.map((id) => rows.find((r) => r.id === id)).filter(Boolean);
  const classAvg = useMemo(() => {
    const v = rows.map((r) => r.score).filter((x) => x !== null);
    return v.length ? v.reduce((a, c) => a + c, 0) / v.length : null;
  }, [rows]);
  const filterSelect = (value, set, label, options) =>
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
    <div>
      <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Year of study">
        {[0, 1, 2, 3, 4].map((y) => (
          <Button
            key={y}
            type="button"
            size="sm"
            role="tab"
            aria-selected={year === y}
            variant={year === y ? "default" : "outline"}
            onClick={() => setYear(y)}
          >
            {y === 0 ? `All years (${rows.length})` : `Year ${y} (${yearCounts[y] ?? 0})`}
          </Button>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {filterSelect(course, setCourse, "course", courses)}
        {filterSelect(section, setSection, "section", sections)}
        {filterSelect(gender, setGender, "gender", genders)}
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, ID or email"
          aria-label="Search students"
          className="max-w-xs"
        />
        <select
          value={band}
          onChange={(e) => setBand(e.target.value)}
          aria-label="Filter by status"
          className={selectClass}
        >
          <option value="">All statuses</option>
          <option value="atrisk">Needs help (at risk)</option>
          {BAND_ORDER.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
          <option value="lowatt">Attendance below 75%</option>
          <option value="nodata">No data yet</option>
        </select>
        {branches.length > 1 && (
          <select
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            aria-label="Filter by branch"
            className={selectClass}
          >
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        )}
        <select
          value={segment}
          onChange={(e) => setSegment(e.target.value)}
          aria-label="Filter by segment"
          className={selectClass}
        >
          <option value="">All segments</option>
          {segments.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <select
          value={acad}
          onChange={(e) => setAcad(e.target.value)}
          aria-label="Filter by academic risk"
          className={selectClass}
        >
          <option value="">Academic risk: all</option>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          aria-label="Filter by placement risk"
          className={selectClass}
        >
          <option value="">Placement risk: all</option>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        {showMentor && (
          <select
            value={mentor}
            onChange={(e) => setMentor(e.target.value)}
            aria-label="Filter by teacher"
            className={selectClass}
          >
            <option value="">All teachers</option>
            <option value="none">No teacher assigned</option>
            {mentors.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        )}
        <span className="text-sm text-muted-foreground">
          {shown.length} of {rows.length}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={shown.length === 0}
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob(["\ufeff" + studentsToCsv(shown)], { type: "text/csv;charset=utf-8" }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = `students-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download /> Export CSV
        </Button>
      </div>
      <div className="overflow-x-auto surface">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-3" aria-label="Compare"></th>
              <th>Student</th>
              <th>Status</th>
              <th>Score</th>
              <th>CGPA</th>
              <th>Attendance</th>
              <th>LMS</th>
              <th>Academic risk</th>
              <th>Placement risk</th>
              <th>vs class avg</th>
              <th>Alerts</th>
              <th>Top score driver</th>
              <th>Main risk driver</th>
              <th>Segment</th>
              {showMentor && <th>Teacher</th>}
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, LIMIT).map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="p-3">
                  <input
                    type="checkbox"
                    aria-label={`Compare ${r.name}`}
                    checked={compare.includes(r.id)}
                    onChange={(e) =>
                      setCompare(
                        e.target.checked
                          ? [...compare.slice(-2), r.id]
                          : compare.filter((x) => x !== r.id),
                      )
                    }
                  />
                </td>
                <td>
                  <Link
                    to="/portal/students/$id"
                    params={{ id: r.id }}
                    className="font-medium text-primary hover:underline"
                  >
                    {r.name}
                  </Link>
                  <span className="block text-xs text-muted-foreground">
                    {r.id} ·{" "}
                    {[r.course, r.branch, r.section && `Sec ${r.section}`]
                      .filter(Boolean)
                      .join(" ")}{" "}
                    · Year {r.year} · Sem {r.semester}
                    {r.gender && ` · ${r.gender}`}
                  </span>
                </td>
                <td>
                  <BandBadge score={r.score} />
                </td>
                <td>{r.score === null ? "—" : Math.round(r.score)}</td>
                <td>{r.cgpa === null ? "—" : r.cgpa.toFixed(2)}</td>
                <td className={lowAttendance(r) ? "font-medium text-destructive" : ""}>
                  {pct(r.attendance)}
                </td>
                <td>{pct(r.lms)}</td>
                <td>
                  <LevelPill level={r.academicRisk} points={r.academicPoints} />
                </td>
                <td>
                  <LevelPill level={r.placementRisk} points={r.placementPoints} />
                </td>
                <td
                  className={
                    classAvg !== null && r.score !== null && r.score < classAvg
                      ? "text-destructive"
                      : "text-success"
                  }
                >
                  {classAvg === null || r.score === null
                    ? "—"
                    : (r.score - classAvg > 0 ? "+" : "") + (r.score - classAvg).toFixed(1)}
                </td>
                <td className={r.urgent ? "font-medium text-destructive" : ""}>{r.alerts}</td>
                <td className="text-xs">{r.topDriver ?? "—"}</td>
                <td className="text-xs">{r.riskDriver ?? "None"}</td>
                <td className="text-xs">{r.segment}</td>
                {showMentor && (
                  <td className={r.mentorId ? "" : "text-muted-foreground"}>
                    {r.mentorName || "Not assigned"}
                  </td>
                )}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td
                  colSpan={showMentor ? 15 : 14}
                  className="p-6 text-center text-muted-foreground"
                >
                  No students match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {compared.length >= 2 && (
        <div className="mt-4 surface p-4">
          <SectionTitle sub="Select up to 3 students in the table to compare">
            Student comparison
          </SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1">Metric</th>
                  {compared.map((r) => (
                    <th key={r.id}>{r.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map(([label, fn]) => (
                  <tr key={label} className="border-t">
                    <td className="py-2 text-muted-foreground">{label}</td>
                    {compared.map((r) => (
                      <td key={r.id} className="font-medium">
                        {fn(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {shown.length > LIMIT && (
        <p className="mt-2 text-xs text-muted-foreground">
          Showing the first {LIMIT}. Use the search or filters to narrow the list.
        </p>
      )}
    </div>
  );
}
