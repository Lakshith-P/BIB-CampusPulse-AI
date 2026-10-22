import { useMemo, useState } from "react";
import { Plus, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, ProgressBar, SectionTitle } from "@/components/widgets";
import {
  ConfirmDialog,
  ErrorState,
  Field,
  PageSkeleton,
  inputClass,
  useAction,
} from "@/components/ui-kit";
import { logAssessment, removeAssessment } from "@/lib/platform.functions";
import { SKILLS, summarizeSkills } from "@/lib/skills-insights";
import { todayIso } from "@/lib/live-profile";
import { useAssessments, useRefreshAll } from "@/lib/use-platform";
import { useCampus } from "@/lib/use-campus";

const cap = (s) => s[0].toUpperCase() + s.slice(1);

/** Score history, topic progress, weak areas and practice suggestions for one student. */
export function SkillProgress({ studentId, canEdit = false }) {
  const { data, isLoading, error, refetch } = useAssessments(studentId);
  const refresh = useRefreshAll();
  const { run } = useAction(refresh);
  const [skill, setSkill] = useState("coding");
  const [removing, setRemoving] = useState(null);
  const summary = useMemo(() => (data ? summarizeSkills(data) : null), [data]);
  if (isLoading) return <PageSkeleton rows={2} />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const current = summary.byCategory[skill];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {SKILLS.map((k) => {
          const c = summary.byCategory[k];
          const selected = k === skill;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={selected}
              onClick={() => setSkill(k)}
              className={`surface p-3 text-left ${selected ? "ring-2 ring-ring" : ""}`}
            >
              <p className="text-xs font-semibold uppercase text-label">{cap(k)}</p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums">
                {c.current === null ? "—" : Math.round(c.current)}
              </p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                {c.trend === null ? (
                  `${c.count} test(s)`
                ) : c.trend >= 0 ? (
                  <>
                    <TrendingUp className="size-3 text-success" /> up {Math.round(c.trend)}
                  </>
                ) : (
                  <>
                    <TrendingDown className="size-3 text-destructive" /> down {Math.round(-c.trend)}
                  </>
                )}
              </p>
            </button>
          );
        })}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="surface p-4">
          <SectionTitle sub="Every recorded test for the selected skill">
            {cap(skill)} score history
          </SectionTitle>
          {current.series.length === 0 ? (
            <p className="text-sm text-muted-foreground">No {skill} assessment recorded yet.</p>
          ) : (
            <div className="h-56" role="img" aria-label={`${skill} scores over time`}>
              <ResponsiveContainer>
                <LineChart data={current.series}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={11} />
                  <YAxis domain={[0, 100]} fontSize={11} />
                  <Tooltip />
                  <Line
                    dataKey="score"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
        <section className="surface p-4">
          <SectionTitle sub="Average score per topic, weakest first">
            Topic-wise progress
          </SectionTitle>
          {summary.topics.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Topics appear once assessments are recorded.
            </p>
          ) : (
            <div className="max-h-56 space-y-3 overflow-y-auto pr-1">
              {summary.topics.map((t) => (
                <div key={`${t.category}-${t.topic}`}>
                  <div className="flex justify-between text-sm">
                    <span>
                      {t.topic}{" "}
                      <span className="text-xs text-muted-foreground">· {t.category}</span>
                    </span>
                    <span
                      className={`tabular-nums ${t.avg < 50 ? "font-semibold text-destructive" : ""}`}
                    >
                      {Math.round(t.avg)}
                      {t.avg < 50 && " · weak area"}
                    </span>
                  </div>
                  <ProgressBar value={t.avg} tone={t.avg < 50 ? "var(--destructive)" : undefined} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      <section className="surface p-4">
        <SectionTitle sub="Built from the recorded scores above">Recommended practice</SectionTitle>
        <ul className="list-inside list-disc space-y-1 text-sm">
          {summary.recommendations.length ? (
            summary.recommendations.map((r) => <li key={r}>{r}</li>)
          ) : (
            <li>No weak areas. Keep practising to stay at this level.</li>
          )}
        </ul>
      </section>
      {canEdit && data.length > 0 && (
        <section className="surface p-4">
          <SectionTitle>Recorded assessments</SectionTitle>
          <ul className="divide-y text-sm">
            {[...data].reverse().map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-1.5">
                <span>
                  {a.taken_on} · {cap(a.category)}
                  {a.topic && ` · ${a.topic}`} · <b className="tabular-nums">{a.score}</b>
                </span>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Remove assessment"
                  onClick={() => setRemoving(a)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
          <ConfirmDialog
            open={Boolean(removing)}
            onOpenChange={(v) => !v && setRemoving(null)}
            title="Remove this assessment?"
            description="The student's current skill level is recalculated without it."
            confirmLabel="Remove"
            onConfirm={() =>
              run(() => removeAssessment({ data: { id: removing.id } }), "Assessment removed.")
            }
          />
        </section>
      )}
    </div>
  );
}

/** Teachers record a test result; the skill level feeding the Success Score updates with it. */
export function AssessmentForm({ fixedStudentId, onDone }) {
  const { rows } = useCampus();
  const [f, setF] = useState({
    studentId: fixedStudentId ?? "",
    category: "coding",
    topic: "",
    score: "",
    takenOn: todayIso(),
  });
  const { busy, run } = useAction(onDone);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await run(
          () => logAssessment({ data: { ...f, score: Number(f.score) } }),
          "Assessment recorded. The skill level was updated.",
        );
        if (r.ok) setF({ ...f, topic: "", score: "" });
      }}
    >
      {!fixedStudentId && (
        <Field label="Student">
          <select value={f.studentId} onChange={set("studentId")} required className={inputClass}>
            <option value="">Choose a student</option>
            {rows.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.id})
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Skill">
        <select value={f.category} onChange={set("category")} className={inputClass}>
          {SKILLS.map((k) => (
            <option key={k} value={k}>
              {cap(k)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Topic">
        <Input
          value={f.topic}
          onChange={set("topic")}
          maxLength={100}
          placeholder="e.g. Arrays, Vocabulary"
        />
      </Field>
      <Field label="Score (0-100)">
        <Input
          type="number"
          min={0}
          max={100}
          step="0.5"
          value={f.score}
          onChange={set("score")}
          required
        />
      </Field>
      <Field label="Date">
        <Input type="date" value={f.takenOn} onChange={set("takenOn")} required />
      </Field>
      <div>
        <Button type="submit" disabled={busy || !f.studentId}>
          <Plus /> Record
        </Button>
      </div>
    </form>
  );
}

export function StaffSkills() {
  const { rows } = useCampus();
  const refresh = useRefreshAll();
  const [studentId, setStudentId] = useState("");
  return (
    <div className="space-y-6">
      <section className="surface p-4">
        <SectionTitle sub="Weekly tests, coding practice, aptitude, verbal and analytical results">
          Record an assessment
        </SectionTitle>
        <AssessmentForm onDone={refresh} />
      </section>
      <section>
        <SectionTitle>Student progress</SectionTitle>
        <div className="mb-3 max-w-sm">
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            aria-label="Student"
            className={inputClass}
          >
            <option value="">Choose a student</option>
            {rows.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.id})
              </option>
            ))}
          </select>
        </div>
        {studentId ? (
          <SkillProgress key={studentId} studentId={studentId} canEdit />
        ) : (
          <EmptyState title="Choose a student to see their history" />
        )}
      </section>
    </div>
  );
}
