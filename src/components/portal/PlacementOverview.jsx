import { Link } from "@tanstack/react-router";
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
import { EmptyState, SectionTitle, StatCard } from "@/components/widgets";
import { PageTitle } from "@/components/portal/PortalShell";
import { PostAnnouncement, AnnouncementsFeed } from "@/components/portal/Announcements";
import { averages } from "@/lib/campus-derive";
import { successScore } from "@/lib/scoring";
import { useCampus } from "@/lib/use-campus";

const LEVELS = [
  ["Low", "var(--success)"],
  ["Medium", "var(--warning)"],
  ["High", "var(--destructive)"],
];
const tip = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--popover-foreground)",
};
const known = (v) => (v >= 0 ? String(v) : "—");

/** The placement dashboard for teachers and administrators. */
export function PlacementOverview() {
  const { rows, isAdmin } = useCampus();
  const avg = averages(rows).avgPlace;
  const levels = LEVELS.map(([name, color]) => ({
    name,
    color,
    count: rows.filter((r) => r.placementRisk === name).length,
  }));
  const ready = rows.filter((r) => {
    const p = successScore(r.s).components.placement;
    return p !== null && p >= 70;
  }).length;
  const resume = rows.filter((r) => r.s.resumeCompleteness >= 0);
  const avgResume = resume.length
    ? resume.reduce((a, r) => a + r.s.resumeCompleteness, 0) / resume.length
    : null;
  const watch = rows
    .filter((r) => r.placementRisk === "High" || r.placementRisk === "Medium")
    .sort((a, b) => b.placementPoints - a.placementPoints)
    .slice(0, 10);
  return (
    <>
      <PageTitle
        title="Placement overview"
        sub={isAdmin ? "Placement readiness across campus" : "Placement readiness of your students"}
      >
        <PostAnnouncement defaultCategory="placement" />
      </PageTitle>
      {rows.length === 0 ? (
        <EmptyState title="No students yet" hint="Readiness appears once students are assigned." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              label="Placement readiness"
              value={avg === null ? "—" : `${avg.toFixed(1)}%`}
              sub="Average across students"
            />
            <StatCard label="Ready (70+)" value={String(ready)} tone="success" />
            <StatCard
              label="High placement risk"
              value={String(levels[2].count)}
              tone={levels[2].count ? "danger" : "success"}
            />
            <StatCard
              label="Resume completeness"
              value={avgResume === null ? "—" : `${avgResume.toFixed(0)}%`}
              sub="Average where recorded"
            />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="surface p-4">
              <SectionTitle sub="Students by placement risk level">Risk levels</SectionTitle>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={levels}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis allowDecimals={false} stroke="var(--muted-foreground)" fontSize={12} />
                  <Tooltip contentStyle={tip} />
                  <Bar
                    isAnimationActive={false}
                    dataKey="count"
                    name="Students"
                    radius={[8, 8, 0, 0]}
                  >
                    {levels.map((l) => (
                      <Cell key={l.name} fill={l.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="surface p-4">
              <SectionTitle sub="Highest placement risk first">Students to watch</SectionTitle>
              {watch.length === 0 && (
                <p className="text-sm text-success">Nobody is at medium or high placement risk.</p>
              )}
              {watch.map((r) => (
                <div key={r.id} className="flex items-center justify-between border-t py-2 text-sm">
                  <span>
                    <Link
                      to="/portal/students/$id"
                      params={{ id: r.id }}
                      className="font-medium text-primary hover:underline"
                    >
                      {r.name}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      Aptitude {known(r.s.skills.aptitude)} · Coding {known(r.s.skills.coding)} ·
                      Resume {known(r.s.resumeCompleteness)}
                    </span>
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      r.placementRisk === "High"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-warning/15 text-warning"
                    }`}
                  >
                    {r.placementRisk}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      <section className="mt-8">
        <SectionTitle sub="Drives and openings posted for students">
          Current placements
        </SectionTitle>
        <AnnouncementsFeed categories={["placement"]} empty="Post a drive to show it to every student." />
      </section>
    </>
  );
}
