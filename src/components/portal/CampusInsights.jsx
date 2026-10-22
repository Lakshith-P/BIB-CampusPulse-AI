import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SectionTitle } from "@/components/widgets";
import { BAND_ORDER } from "@/lib/campus-derive";

const card = "surface p-4";
const BAND_COLOR = {
  "On Track": "var(--success)",
  Monitor: "var(--info)",
  "Needs Attention": "var(--warning)",
  "High Priority": "var(--destructive)",
};
const PALETTE = [
  "var(--chart-1)",
  "var(--chart-5)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-2)",
];
const tip = { background: "var(--card)", border: "1px solid var(--border)" };
const LEVELS = ["Low", "Medium", "High"];
const LEVEL_TONE = {
  High: "border-destructive/40 text-destructive",
  Medium: "border-warning/40 text-warning",
  Low: "border-success/40 text-success",
};

function heat(ratio) {
  if (ratio === 0) return "";
  if (ratio < 0.25) return "bg-warning/10";
  if (ratio < 0.5) return "bg-warning/25";
  return "bg-destructive/25";
}

/** Charts, risk-flag counts and a branch x flag heatmap for the students a staff member can see. */
export function CampusInsights({ rows }) {
  const data = useMemo(() => {
    const bands = BAND_ORDER.map((name) => ({
      name,
      count: rows.filter((r) => r.band === name).length,
    }));
    const trend = [1, 2, 3, 4, 5].flatMap((sem) => {
      const have = rows.filter((r) => r.s.semesterGrades.length >= sem);
      if (!have.length) return [];
      const sum = have.reduce((a, r) => a + (r.s.semesterGrades[sem - 1] ?? 0), 0);
      return [{ sem: `Sem ${sem}`, avgSgpa: +(sum / have.length).toFixed(2) }];
    });
    const flags = (key) =>
      LEVELS.map((level) => ({ level, count: rows.filter((r) => r[key] === level).length }));
    const branches = [...new Set(rows.map((r) => r.branch))].sort().map((branch) => {
      const list = rows.filter((r) => r.branch === branch);
      const n = (key, level) => list.filter((r) => r[key] === level).length;
      return {
        branch,
        total: list.length,
        cells: [
          n("academicRisk", "High"),
          n("academicRisk", "Medium"),
          n("placementRisk", "High"),
          n("placementRisk", "Medium"),
        ],
      };
    });
    const segments = [
      ...rows.reduce((m, r) => m.set(r.segment, (m.get(r.segment) ?? 0) + 1), new Map()),
    ]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    return {
      bands,
      trend,
      academic: flags("academicRisk"),
      placement: flags("placementRisk"),
      branches,
      segments,
    };
  }, [rows]);

  if (rows.length === 0) return null;
  return (
    <div className="mt-6">
      <h2 className="mb-3 font-display text-lg font-semibold">Insights</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <SectionTitle sub="Students per status band">Score distribution</SectionTitle>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.bands}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <YAxis allowDecimals={false} stroke="var(--muted-foreground)" />
              <Tooltip contentStyle={tip} />
              <Bar isAnimationActive={false} dataKey="count" name="Students" radius={[8, 8, 0, 0]}>
                {data.bands.map((b) => (
                  <Cell key={b.name} fill={BAND_COLOR[b.name] ?? "var(--primary)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className={card}>
          <SectionTitle sub="Average SGPA across the semesters recorded">
            Academic trend
          </SectionTitle>
          {data.trend.length < 2 ? (
            <p className="text-sm text-muted-foreground">
              Semester grades are not recorded for enough students yet.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="sem" stroke="var(--muted-foreground)" />
                <YAxis domain={[0, 10]} stroke="var(--muted-foreground)" />
                <Tooltip contentStyle={tip} />
                <Line
                  isAnimationActive={false}
                  type="monotone"
                  dataKey="avgSgpa"
                  name="Avg SGPA"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className={card}>
          <SectionTitle sub="Points-based flags; drivers are listed on each student">
            Risk flag levels
          </SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["Academic risk", data.academic],
              ["Placement risk", data.placement],
            ].map(([title, list]) => (
              <div key={title}>
                <p className="mb-2 text-sm font-medium">{title}</p>
                <div className="flex gap-2">
                  {list.map((l) => (
                    <div
                      key={l.level}
                      className={`flex-1 rounded-lg border p-2 text-center ${LEVEL_TONE[l.level]}`}
                    >
                      <p className="text-lg font-bold">{l.count}</p>
                      <p className="text-xs text-muted-foreground">{l.level}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className={card}>
          <SectionTitle sub="Students per branch at Medium or High on each flag">
            Branch × flag heatmap
          </SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1">Branch</th>
                  <th>Acad High</th>
                  <th>Acad Med</th>
                  <th>Place High</th>
                  <th>Place Med</th>
                </tr>
              </thead>
              <tbody>
                {data.branches.map((b) => (
                  <tr key={b.branch} className="border-t">
                    <td className="py-2 font-medium">{b.branch}</td>
                    {b.cells.map((v, i) => (
                      <td
                        key={i}
                        className={`${heat(b.total ? v / b.total : 0)} px-2 py-2 text-center font-medium`}
                      >
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className={`${card} lg:col-span-2`}>
          <SectionTitle sub="Groups that share a next step">Student segments</SectionTitle>
          <ResponsiveContainer width="100%" height={Math.max(160, data.segments.length * 38)}>
            <BarChart data={data.segments} layout="vertical" margin={{ left: 40 }}>
              <XAxis type="number" allowDecimals={false} stroke="var(--muted-foreground)" />
              <YAxis
                type="category"
                dataKey="name"
                width={250}
                tick={{ fontSize: 11 }}
                stroke="var(--muted-foreground)"
              />
              <Tooltip contentStyle={tip} />
              <Bar isAnimationActive={false} dataKey="count" name="Students" radius={[0, 8, 8, 0]}>
                {data.segments.map((g, i) => (
                  <Cell key={g.name} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
