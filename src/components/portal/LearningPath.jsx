import { Check, Circle, CircleDot } from "lucide-react";
import { EmptyState, ProgressBar, SectionTitle } from "@/components/widgets";
import { pct } from "@/components/portal/StudentTable";
import { attendancePct } from "@/lib/scoring";

const card = "surface p-4";

const unitDone = (u) => {
  const lessonsDone = u.lessons.every((l) => l.completed);
  const hasAssignment = u.assignment.title !== "—";
  return lessonsDone && (!hasAssignment || u.assignment.submitted);
};

/** The first thing left to do in a unit, in plain words. */
function nextStep(u) {
  const lesson = u.lessons.find((l) => !l.completed);
  if (lesson) return `Complete the lesson "${lesson.title}"`;
  if (u.assignment.title !== "—" && !u.assignment.submitted)
    return `Submit "${u.assignment.title}"${u.assignment.deadline ? ` by ${u.assignment.deadline}` : ""}`;
  return null;
}

/** This semester's courses and where the student is in each, from the recorded subjects and LMS. */
export function LearningPath({ s }) {
  const names = [...new Set([...s.subjects.map((x) => x.subject), ...s.lms.map((x) => x.subject)])];
  if (names.length === 0)
    return (
      <EmptyState
        title="No courses recorded for this semester yet"
        hint="Your courses appear here once your marks, attendance or LMS content are added."
      />
    );
  const courses = names.map((name) => {
    const sub = s.subjects.find((x) => x.subject === name);
    const lms = s.lms.find((x) => x.subject === name);
    const units = lms?.units ?? [];
    const done = units.filter(unitDone).length;
    const current = units.findIndex((u) => !unitDone(u));
    return {
      name,
      sub,
      units,
      done,
      current,
      att: sub ? attendancePct(sub.classesAttended, sub.classesHeld) : null,
    };
  });
  const totalUnits = courses.reduce((a, c) => a + c.units.length, 0);
  const doneUnits = courses.reduce((a, c) => a + c.done, 0);
  return (
    <div className="space-y-4">
      <div className={card}>
        <SectionTitle sub={`${courses.length} course(s) this semester`}>
          Semester {s.semester} progress
        </SectionTitle>
        {totalUnits > 0 ? (
          <>
            <div className="mb-1 flex justify-between text-sm">
              <span>
                {doneUnits} of {totalUnits} units complete
              </span>
              <span>{Math.round((doneUnits / totalUnits) * 100)}%</span>
            </div>
            <ProgressBar value={(doneUnits / totalUnits) * 100} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No LMS units recorded yet.</p>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {courses.map((c) => {
          const step = c.current >= 0 ? nextStep(c.units[c.current]) : null;
          return (
            <section key={c.name} className={card}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-lg font-semibold">{c.name}</h3>
                <div className="text-right text-xs text-muted-foreground">
                  {c.sub && <p>Marks {c.sub.marks}/100</p>}
                  <p>Attendance {pct(c.att)}</p>
                </div>
              </div>
              {c.units.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  No units recorded for this course yet.
                </p>
              ) : (
                <>
                  <p className="mt-2 text-sm">
                    {c.done} of {c.units.length} units complete
                  </p>
                  <ProgressBar value={(c.done / c.units.length) * 100} />
                  {step ? (
                    <p className="mt-3 rounded-lg bg-primary/5 p-2 text-sm">
                      <b>Next:</b> {step}
                    </p>
                  ) : (
                    <p className="mt-3 rounded-lg bg-success/10 p-2 text-sm text-success">
                      All units complete for this course.
                    </p>
                  )}
                  <ol className="mt-3 space-y-1.5">
                    {c.units.map((u, i) => {
                      const done = unitDone(u);
                      const Icon = done ? Check : i === c.current ? CircleDot : Circle;
                      return (
                        <li
                          key={u.unit}
                          className={`flex items-center gap-2 text-sm ${done ? "text-success" : i === c.current ? "font-medium" : "text-muted-foreground"}`}
                        >
                          <Icon className="size-4 shrink-0" />
                          {u.title || `Unit ${u.unit}`}
                        </li>
                      );
                    })}
                  </ol>
                </>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
