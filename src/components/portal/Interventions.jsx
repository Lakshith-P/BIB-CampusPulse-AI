import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SectionTitle } from "@/components/widgets";
import { changeCampusIntervention, saveCampusIntervention } from "@/lib/campus.functions";
import { useCampus } from "@/lib/use-campus";

const selectClass = "rounded-md border bg-background p-2 text-sm";
const STATUS = { open: "Open", "in-progress": "In progress", resolved: "Resolved" };
const PRIORITY_CLASS = {
  high: "bg-destructive/15 text-destructive",
  medium: "bg-warning/15 text-warning",
  low: "bg-success/15 text-success",
};

export function InterventionCard({ item, studentName, canManage }) {
  const { refresh, today } = useCampus();
  const change = useServerFn(changeCampusIntervention);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const overdue = item.status !== "resolved" && item.follow_up_date < today;
  async function submit(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setMsg("");
    try {
      await change({
        data: {
          id: item.id,
          status: String(f.get("status")),
          outcome: String(f.get("outcome") ?? ""),
        },
      });
      await refresh();
      setMsg("Updated.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          {studentName && (
            <Link
              to="/portal/students/$id"
              params={{ id: item.student_id }}
              className="text-xs font-medium text-primary hover:underline"
            >
              {studentName}
            </Link>
          )}
          <p className="font-semibold">{item.action}</p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className={`rounded-full px-2 py-0.5 ${PRIORITY_CLASS[item.priority] ?? ""}`}>
            {item.priority} priority
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5">{STATUS[item.status]}</span>
        </div>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{item.reason}</p>
      <p className="mt-2 text-xs">
        {item.owner} · Follow-up {item.follow_up_date}
        {overdue && <span className="ml-2 font-medium text-destructive">Overdue</span>}
      </p>
      {item.outcome && <p className="mt-2 text-sm">Outcome: {item.outcome}</p>}
      {canManage && (
        <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={submit}>
          <select
            name="status"
            defaultValue={item.status}
            aria-label="Status"
            className={selectClass}
          >
            <option value="open">Open</option>
            <option value="in-progress">In progress</option>
            <option value="resolved">Resolved</option>
          </select>
          <Input
            name="outcome"
            defaultValue={item.outcome}
            placeholder="Outcome notes"
            aria-label="Outcome notes"
            className="min-w-40 flex-1"
          />
          <Button type="submit" variant="outline" size="sm" disabled={busy}>
            Save
          </Button>
          {msg && (
            <span role="status" className="text-xs text-muted-foreground">
              {msg}
            </span>
          )}
        </form>
      )}
    </article>
  );
}

/** Creates a support action. Pass `fixedStudentId` to lock it to one student, or `choices` to pick. */
export function InterventionForm({ fixedStudentId, choices = [] }) {
  const { refresh, profile } = useCampus();
  const create = useServerFn(saveCampusIntervention);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function submit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setMsg("");
    try {
      await create({
        data: {
          studentId: fixedStudentId ?? String(f.get("student")),
          reason: String(f.get("reason")),
          action: String(f.get("action")),
          priority: String(f.get("priority")),
          owner: String(f.get("owner")),
          followUpDate: String(f.get("date")),
        },
      });
      await refresh();
      form.reset();
      setMsg("Intervention saved.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Intervention could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3 surface p-4">
      <h3 className="font-semibold">Create an intervention</h3>
      {!fixedStudentId && (
        <select name="student" required aria-label="Student" className={`${selectClass} w-full`}>
          <option value="">Choose a student…</option>
          {choices.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.id})
            </option>
          ))}
        </select>
      )}
      <Input
        name="reason"
        required
        minLength={5}
        placeholder="Evidence and reason"
        aria-label="Intervention reason"
      />
      <Textarea
        name="action"
        required
        minLength={5}
        placeholder="Practical next action"
        aria-label="Intervention action"
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Input
          name="owner"
          required
          defaultValue={profile.display_name ?? ""}
          placeholder="Owner"
          aria-label="Intervention owner"
        />
        <Input name="date" type="date" required aria-label="Follow-up date" />
        <select name="priority" defaultValue="medium" aria-label="Priority" className={selectClass}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy}>
          <Plus /> Save intervention
        </Button>
        {msg && (
          <span role="status" className="text-sm text-muted-foreground">
            {msg}
          </span>
        )}
      </div>
    </form>
  );
}

/** The support plan for one student (read-only for students, editable for staff). */
export function SupportPlan({ studentId, canManage }) {
  const { interventions } = useCampus();
  const mine = interventions.filter((i) => i.student_id === studentId);
  return (
    <section className="mt-8">
      <SectionTitle sub="Actions agreed with a mentor to help this student">
        Mentor support plan
      </SectionTitle>
      <div className="space-y-3">
        {mine.length === 0 && (
          <p className="text-sm text-muted-foreground">No support actions yet.</p>
        )}
        {mine.map((i) => (
          <InterventionCard key={i.id} item={i} canManage={canManage} />
        ))}
        {canManage && <InterventionForm fixedStudentId={studentId} />}
      </div>
    </section>
  );
}
