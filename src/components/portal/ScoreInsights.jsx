import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { SectionTitle } from "@/components/widgets";
import { LABELS } from "@/components/student-profile/shared";
import { successScore } from "@/lib/scoring";
import { DEFAULT_WEIGHTS } from "@/lib/types";

const COLORS = {
  academics: "oklch(0.55 0.18 265)",
  attendance: "oklch(0.62 0.15 230)",
  lms: "oklch(0.55 0.2 300)",
  engagement: "oklch(0.68 0.17 60)",
  skills: "oklch(0.6 0.16 160)",
  placement: "oklch(0.6 0.2 15)",
};
const SKILL_LABELS = {
  coding: "Coding",
  aptitude: "Aptitude",
  analytical: "Analytical",
  verbal: "Verbal",
  communication: "Communication",
};

/** Where a student's score comes from, and how their skills compare, as two visual cards. */
export function ScoreInsights({ s }) {
  const { components } = successScore(s);
  const parts = Object.keys(LABELS).map((k) => ({
    key: k,
    label: LABELS[k],
    value: components[k],
    weight: Math.round(DEFAULT_WEIGHTS[k] ?? 0),
  }));
  const skills = Object.entries(SKILL_LABELS).map(([k, label]) => ({
    skill: label,
    value: s.skills[k] >= 0 ? s.skills[k] : 0,
  }));
  const hasSkills = Object.values(s.skills).some((v) => v >= 0);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="surface p-5">
        <SectionTitle sub="Each area counts towards your success score">
          What makes up your score
        </SectionTitle>
        <div className="space-y-4">
          {parts.map((p) => (
            <div key={p.key}>
              <div className="mb-1.5 flex items-baseline justify-between text-sm">
                <span className="font-medium">
                  {p.label}
                  {p.weight > 0 && (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      counts {p.weight}%
                    </span>
                  )}
                </span>
                <span className="font-display font-bold tabular-nums">
                  {p.value === null ? "—" : Math.round(p.value)}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-[width] duration-700"
                  style={{
                    width: `${p.value === null ? 0 : Math.min(100, p.value)}%`,
                    background: `linear-gradient(90deg, ${COLORS[p.key]}, color-mix(in oklch, ${COLORS[p.key]} 60%, white))`,
                  }}
                />
              </div>
              {p.value === null && (
                <p className="mt-1 text-xs text-muted-foreground">Not recorded yet</p>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="surface p-5">
        <SectionTitle sub="Your assessment scores out of 100">Skills profile</SectionTitle>
        {hasSkills ? (
          <div className="h-72">
            <ResponsiveContainer>
              <RadarChart data={skills} outerRadius="72%">
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="skill" tick={{ fontSize: 12, fill: "currentColor" }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Tooltip />
                <Radar
                  isAnimationActive={false}
                  dataKey="value"
                  name="Score"
                  stroke="var(--primary)"
                  fill="var(--primary)"
                  fillOpacity={0.3}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No skill assessments recorded yet. They appear here once your teacher adds them.
          </p>
        )}
      </div>
    </div>
  );
}
