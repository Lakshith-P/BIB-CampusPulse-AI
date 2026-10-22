import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveStudentAcademics } from "@/lib/campus.functions";
import { studentSchema } from "@/lib/student-validation";

const SKILLS = ["coding", "aptitude", "analytical", "verbal", "communication"];
const field = "mt-1";

/**
 * Where a teacher (or administrator) keeps a student's marks, attendance and skills up to date.
 * The server only accepts this for students assigned to the signed-in teacher.
 */
export function AcademicsEditor({ s, onSaved }) {
  const save = useServerFn(saveStudentAcademics);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(() => s.subjects.map((x) => ({ ...x })));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ ok: true, text: "" });
  const setRow = (i, key, value) =>
    setRows((all) => all.map((r, n) => (n === i ? { ...r, [key]: value } : r)));

  async function submit(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const num = (key, fallback = 0) => (f.get(key) === "" ? fallback : Number(f.get(key)));
    const grades = String(f.get("grades") ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .map(Number);
    const student = {
      ...s,
      semester: num("semester", 1),
      cgpa: num("cgpa"),
      backlogs: num("backlogs"),
      semesterGrades: grades,
      resumeCompleteness: num("resume", -1),
      assessmentsCompleted: num("assessmentsCompleted"),
      assessmentsRequired: num("assessmentsRequired"),
      skills: Object.fromEntries(SKILLS.map((k) => [k, num(`skill_${k}`, -1)])),
      subjects: rows
        .filter((r) => String(r.subject).trim())
        .map((r) => ({
          subject: String(r.subject).trim(),
          marks: Number(r.marks) || 0,
          classesHeld: Number(r.classesHeld) || 0,
          classesAttended: Number(r.classesAttended) || 0,
        })),
    };
    const parsed = studentSchema.safeParse(student);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setMsg({
        ok: false,
        text: `${issue.path.join(" › ") || "Details"}: ${issue.message}`,
      });
      return;
    }
    setBusy(true);
    setMsg({ ok: true, text: "" });
    try {
      await save({ data: { student: parsed.data } });
      await onSaved?.();
      setMsg({ ok: true, text: "Saved. Scores and insights are updated." });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="surface mt-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <span>
          <span className="block font-display text-lg font-semibold">
            Update marks and attendance
          </span>
          <span className="text-sm text-muted-foreground">
            CGPA, subject marks, classes attended, skills and placement assessments
          </span>
        </span>
        <ChevronDown
          className={`size-5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <form onSubmit={submit} className="space-y-5 border-t p-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <label className="text-sm">
              Semester
              <Input
                name="semester"
                type="number"
                min={1}
                max={8}
                defaultValue={s.semester}
                className={field}
              />
            </label>
            <label className="text-sm">
              CGPA (0 if none yet)
              <Input
                name="cgpa"
                type="number"
                step="0.01"
                min={0}
                max={10}
                defaultValue={s.cgpa}
                className={field}
              />
            </label>
            <label className="text-sm">
              Backlogs
              <Input
                name="backlogs"
                type="number"
                min={0}
                defaultValue={s.backlogs}
                className={field}
              />
            </label>
            <label className="text-sm">
              Resume % (blank if unknown)
              <Input
                name="resume"
                type="number"
                step="any"
                min={0}
                max={100}
                defaultValue={s.resumeCompleteness >= 0 ? s.resumeCompleteness : ""}
                className={field}
              />
            </label>
          </div>
          <label className="block text-sm">
            SGPA by semester, separated by commas
            <Input
              name="grades"
              defaultValue={s.semesterGrades.join(", ")}
              placeholder="7.2, 7.8, 8.1"
              className={field}
            />
          </label>

          <div>
            <p className="mb-2 text-sm font-medium">Subjects</p>
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_5rem_5rem_5rem_auto] items-center gap-2"
                >
                  <Input
                    value={r.subject}
                    onChange={(e) => setRow(i, "subject", e.target.value)}
                    placeholder="Subject"
                    aria-label="Subject"
                  />
                  <Input
                    type="number"
                    step="any"
                    min={0}
                    max={100}
                    value={r.marks}
                    onChange={(e) => setRow(i, "marks", e.target.value)}
                    aria-label="Marks out of 100"
                    title="Marks out of 100"
                  />
                  <Input
                    type="number"
                    min={0}
                    value={r.classesHeld}
                    onChange={(e) => setRow(i, "classesHeld", e.target.value)}
                    aria-label="Classes held"
                    title="Classes held"
                  />
                  <Input
                    type="number"
                    min={0}
                    value={r.classesAttended}
                    onChange={(e) => setRow(i, "classesAttended", e.target.value)}
                    aria-label="Classes attended"
                    title="Classes attended"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove subject"
                    onClick={() => setRows((all) => all.filter((_, n) => n !== i))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Columns: subject, marks out of 100, classes held, classes attended.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() =>
                setRows((all) => [
                  ...all,
                  { subject: "", marks: 0, classesHeld: 0, classesAttended: 0 },
                ])
              }
            >
              <Plus /> Add subject
            </Button>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Skills and placement (blank if not assessed)</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {SKILLS.map((k) => (
                <label key={k} className="text-sm capitalize">
                  {k}
                  <Input
                    name={`skill_${k}`}
                    type="number"
                    step="any"
                    min={0}
                    max={100}
                    defaultValue={s.skills[k] >= 0 ? s.skills[k] : ""}
                    className={field}
                  />
                </label>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 md:w-1/2">
              <label className="text-sm">
                Assessments done
                <Input
                  name="assessmentsCompleted"
                  type="number"
                  min={0}
                  defaultValue={s.assessmentsCompleted}
                  className={field}
                />
              </label>
              <label className="text-sm">
                Assessments required
                <Input
                  name="assessmentsRequired"
                  type="number"
                  min={0}
                  defaultValue={s.assessmentsRequired}
                  className={field}
                />
              </label>
            </div>
          </div>

          {msg.text && (
            <p role="status" className={`text-sm ${msg.ok ? "text-success" : "text-destructive"}`}>
              {msg.text}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            <Save /> {busy ? "Saving…" : "Save changes"}
          </Button>
        </form>
      )}
    </section>
  );
}
