import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, CircleCheck, MapPin, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorState, Field, inputClass, useAction } from "@/components/ui-kit";
import { SectionTitle } from "@/components/widgets";
import {
  cancelMeeting,
  loadMeetings,
  requestMeeting,
  respondMeeting,
} from "@/lib/meetings.functions";
import { cn } from "@/lib/utils";

// Booking time with the assigned mentor: the student's "Schedule Slot" dialog and their upcoming
// meetings, and the mentor's list of requests to confirm, decline or complete.

const MEETINGS_KEY = ["mentor-meetings"];
const useMeetings = () => useQuery({ queryKey: MEETINGS_KEY, queryFn: () => loadMeetings() });

const STATUS = {
  requested: ["Waiting for mentor", "bg-amber-50 text-[#B87A0E] border-amber-200"],
  confirmed: ["Confirmed", "bg-emerald-50 text-[#16865B] border-emerald-200"],
  declined: ["Declined", "bg-red-50 text-[#C83C4A] border-red-200"],
  cancelled: ["Cancelled", "bg-slate-50 text-slate-500 border-slate-200"],
  completed: ["Completed", "bg-[#eef4ff] text-[#00338D] border-blue-200"],
};
function StatusTag({ status }) {
  const [text, cls] = STATUS[status] ?? STATUS.cancelled;
  return (
    <span
      className={cn(
        "whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        cls,
      )}
    >
      {text}
    </span>
  );
}

const formatSlot = (iso) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const upcoming = (m) =>
  ["requested", "confirmed"].includes(m.status) && new Date(m.slotAt) > new Date();

const pad = (n) => String(n).padStart(2, "0");
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The student's dialog for asking their mentor for a slot. */
export function ScheduleSlotDialog({ open, onOpenChange, mentorName }) {
  const qc = useQueryClient();
  const tomorrow = new Date(Date.now() + 86_400_000);
  const last = new Date(Date.now() + 60 * 86_400_000);
  const [f, setF] = useState({
    date: localDate(tomorrow),
    time: "10:00",
    durationMin: 30,
    mode: "in-person",
    topic: "",
  });
  const { busy, run } = useAction(() => qc.invalidateQueries({ queryKey: MEETINGS_KEY }));
  const set = (k) => (e) =>
    setF({ ...f, [k]: k === "durationMin" ? Number(e.target.value) : e.target.value });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule a slot with {mentorName || "your mentor"}</DialogTitle>
          <DialogDescription>
            Your mentor is notified and confirms or suggests another time. You will be notified of
            their answer.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const slotAt = new Date(`${f.date}T${f.time}`);
            const r = await run(
              () =>
                requestMeeting({
                  data: {
                    slotAt: slotAt.toISOString(),
                    durationMin: f.durationMin,
                    mode: f.mode,
                    topic: f.topic,
                  },
                }),
              "Request sent to your mentor.",
            );
            if (r.ok) {
              setF({ ...f, topic: "" });
              onOpenChange(false);
            }
          }}
        >
          <Field label="Date">
            <input
              type="date"
              required
              className={inputClass}
              value={f.date}
              min={localDate(tomorrow)}
              max={localDate(last)}
              onChange={set("date")}
            />
          </Field>
          <Field label="Time">
            <input
              type="time"
              required
              step={900}
              className={inputClass}
              value={f.time}
              onChange={set("time")}
            />
          </Field>
          <Field label="Length">
            <select className={inputClass} value={f.durationMin} onChange={set("durationMin")}>
              {[15, 30, 45, 60].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </select>
          </Field>
          <Field label="Where">
            <select className={inputClass} value={f.mode} onChange={set("mode")}>
              <option value="in-person">In person</option>
              <option value="online">Online</option>
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="What do you want to discuss?">
              <textarea
                required
                minLength={3}
                maxLength={300}
                rows={3}
                className={inputClass}
                value={f.topic}
                onChange={set("topic")}
                placeholder="e.g. Plan to clear my Maths backlog before the re-exam"
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} className="bg-[#00205f] hover:bg-[#001B54]">
              <CalendarClock /> {busy ? "Sending…" : "Request slot"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The student's upcoming meetings, shown in the mentor card. */
export function MyUpcomingMeetings() {
  const qc = useQueryClient();
  const { data } = useMeetings();
  const { busy, run } = useAction(() => qc.invalidateQueries({ queryKey: MEETINGS_KEY }));
  const list = (data ?? []).filter(upcoming).sort((a, b) => a.slotAt.localeCompare(b.slotAt));
  const recent = (data ?? []).find((m) => !upcoming(m) && m.status === "declined");
  if (!list.length && !recent) return null;
  return (
    <div className="mt-3 space-y-1.5 border-t border-[#D9E1EC] pt-3">
      <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-slate-500">Meetings</p>
      {list.map((m) => (
        <div key={m.id} className="rounded-md border border-[#D9E1EC] bg-white p-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-[#00205f]">{formatSlot(m.slotAt)}</span>
            <StatusTag status={m.status} />
          </div>
          <p className="mt-0.5 truncate text-slate-600">
            {m.durationMin} min · {m.mode === "online" ? "Online" : "In person"} · {m.topic}
          </p>
          {m.mentorNote && <p className="mt-0.5 text-slate-500">Mentor: {m.mentorNote}</p>}
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => cancelMeeting({ data: { id: m.id } }), "Meeting cancelled.")}
            className="mt-1 text-[11px] font-semibold text-[#C83C4A] hover:underline"
          >
            Cancel
          </button>
        </div>
      ))}
      {recent && !list.length && (
        <p className="text-[11px] text-slate-500">
          Your last request ({formatSlot(recent.slotAt)}) was declined
          {recent.mentorNote ? `: ${recent.mentorNote}` : "."} Pick another time.
        </p>
      )}
    </div>
  );
}

/** The mentor's meeting requests and confirmed meetings. */
export function MentorMeetingsPanel() {
  const qc = useQueryClient();
  const { data, error, refetch, isLoading } = useMeetings();
  const [notes, setNotes] = useState({});
  const { busy, run } = useAction(() => qc.invalidateQueries({ queryKey: MEETINGS_KEY }));
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading) return null;
  const now = new Date();
  const pending = (data ?? []).filter((m) => m.status === "requested" && new Date(m.slotAt) > now);
  const confirmed = (data ?? [])
    .filter((m) => m.status === "confirmed")
    .sort((a, b) => a.slotAt.localeCompare(b.slotAt));
  const respond = (m, decision, done) =>
    run(() => respondMeeting({ data: { id: m.id, decision, note: notes[m.id] ?? "" } }), done);
  const row = (m, actions) => (
    <li key={m.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          {m.studentName ?? m.studentId}{" "}
          <span className="font-normal text-muted-foreground">· {formatSlot(m.slotAt)}</span>
        </p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {m.mode === "online" ? <Video className="size-3" /> : <MapPin className="size-3" />}
          {m.durationMin} min · {m.mode === "online" ? "Online" : "In person"}
          {m.mentorName && ` · with ${m.mentorName}`}
        </p>
        <p className="mt-1 text-sm">{m.topic}</p>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <StatusTag status={m.status} />
        {actions}
      </div>
    </li>
  );
  return (
    <section className="surface mb-6 p-4" aria-label="Meeting requests">
      <SectionTitle sub="Students ask for a slot from their dashboard. Confirm or decline; they are notified either way.">
        Meeting requests {pending.length > 0 && `(${pending.length})`}
      </SectionTitle>
      {pending.length === 0 && confirmed.length === 0 ? (
        <p className="text-sm text-muted-foreground">No meeting requests right now.</p>
      ) : (
        <ul className="divide-y">
          {pending.map((m) =>
            row(
              m,
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <input
                  aria-label={`Note for ${m.studentName ?? m.studentId}`}
                  placeholder="Optional note (room, link…)"
                  maxLength={500}
                  value={notes[m.id] ?? ""}
                  onChange={(e) => setNotes({ ...notes, [m.id]: e.target.value })}
                  className="h-8 w-52 rounded-md border bg-card px-2 text-xs"
                />
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => respond(m, "confirmed", "Meeting confirmed.")}
                >
                  <Check /> Confirm
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => respond(m, "declined", "Meeting declined.")}
                >
                  <X /> Decline
                </Button>
              </div>,
            ),
          )}
          {confirmed.map((m) =>
            row(
              m,
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => respond(m, "completed", "Marked as completed.")}
              >
                <CircleCheck /> Mark completed
              </Button>,
            ),
          )}
        </ul>
      )}
    </section>
  );
}
