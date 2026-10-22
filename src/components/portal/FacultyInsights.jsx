import { Link } from "@tanstack/react-router";
import { TrendingDown } from "lucide-react";
import { SectionTitle } from "@/components/widgets";
import { StatusPill } from "@/components/ui-kit";
import { crossSourceInsights } from "@/lib/scoring";

const card = "surface p-4";
const SEVERITY = { critical: "danger", warning: "warning", info: "info" };

/** Students whose most recent SGPA fell clearly below their earlier results. */
export function decliningStudents(rows) {
  return rows
    .map((r) => {
      const g = r.s.semesterGrades.filter((x) => x > 0);
      if (g.length < 2) return null;
      const drop = g.at(-2) - g.at(-1);
      const fromBest = Math.max(...g.slice(0, -1)) - g.at(-1);
      return drop >= 0.5 || fromBest >= 1 ? { r, drop, from: g.at(-2), to: g.at(-1) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.drop - a.drop);
}

export function FacultyInsights({ rows }) {
  const declining = decliningStudents(rows);
  const insights = crossSourceInsights(rows.map((r) => r.s));
  const nameOf = new Map(rows.map((r) => [r.id, r]));
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <div className={card}>
        <SectionTitle sub="Latest SGPA clearly below the previous semester or the student's best">
          Declining performance
        </SectionTitle>
        {declining.length === 0 ? (
          <p className="text-sm text-success">No student shows a clear decline.</p>
        ) : (
          <ul className="divide-y text-sm">
            {declining.slice(0, 6).map(({ r, from, to }) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                <Link
                  to="/portal/students/$id"
                  params={{ id: r.id }}
                  className="font-medium text-primary hover:underline"
                >
                  {r.name}
                </Link>
                <span className="inline-flex items-center gap-1 tabular-nums text-destructive">
                  <TrendingDown className="size-4" aria-hidden />
                  SGPA {from.toFixed(1)} → {to.toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className={card}>
        <SectionTitle sub="Patterns that only show when sources are read together">
          Cross-source insights
        </SectionTitle>
        {insights.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cross-source patterns found.</p>
        ) : (
          <ul className="max-h-72 space-y-2 overflow-y-auto pr-1 text-sm">
            {insights.slice(0, 8).map((i, k) => (
              <li key={k} className="rounded-lg border p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    to="/portal/students/$id"
                    params={{ id: i.studentId }}
                    className="font-medium text-primary hover:underline"
                  >
                    {nameOf.get(i.studentId)?.name ?? i.studentName}
                  </Link>
                  <StatusPill tone={SEVERITY[i.severity]}>{i.type}</StatusPill>
                </div>
                <p className="mt-1 text-muted-foreground">{i.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
