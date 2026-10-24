import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FileField, useAction } from "@/components/ui-kit";
import { messageDashboardStudents } from "@/lib/platform.functions";
import { useCampus } from "@/lib/use-campus";

const SHOWN = 200;

/**
 * A teacher writes to all of their students at once, or to the ones they pick (one is fine). Each
 * student gets the message in their own private chat with the teacher and can answer there.
 */
export function BroadcastComposer({ onClose }) {
  const { rows } = useCampus();
  const qc = useQueryClient();
  const { busy, run } = useAction();
  // only students with a login can be written to
  const people = useMemo(() => rows.filter((r) => r.ownerId), [rows]);
  const [mode, setMode] = useState("all");
  const [picked, setPicked] = useState(new Set());
  const [find, setFind] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [done, setDone] = useState("");

  const shown = useMemo(() => {
    const q = find.trim().toLowerCase();
    return people
      .filter(
        (p) =>
          !q || `${p.name} ${p.id} ${p.branch ?? ""} ${p.section ?? ""}`.toLowerCase().includes(q),
      )
      .slice(0, SHOWN);
  }, [people, find]);
  const toggle = (id) =>
    setPicked((all) => {
      const next = new Set(all);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const count = mode === "all" ? people.length : picked.size;
  const ready = (text.trim() || file) && count > 0;

  return (
    <form
      className="flex min-h-[32rem] flex-col gap-3 rounded-xl border bg-card p-4"
      aria-label="Message students"
      onSubmit={async (e) => {
        e.preventDefault();
        setDone("");
        const r = await run(() =>
          messageDashboardStudents({
            data: {
              all: mode === "all",
              studentIds: mode === "all" ? [] : [...picked],
              body: text.trim(),
              ...(file ? { file } : {}),
            },
          }),
        );
        if (r.ok) {
          setDone(
            `Sent to ${r.result.sent} student${r.result.sent === 1 ? "" : "s"}${
              r.result.skipped ? ` (${r.result.skipped} could not be reached)` : ""
            }. They can answer in their private chat.`,
          );
          setText("");
          setFile(null);
          setPicked(new Set());
          qc.invalidateQueries({ queryKey: ["dashboard-chat"] });
          qc.invalidateQueries({ queryKey: ["dashboard-chat-messages"] });
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">Message students</h2>
          <p className="text-xs text-muted-foreground">
            Everyone receives it in their own private chat with you.
          </p>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">To</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="to" checked={mode === "all"} onChange={() => setMode("all")} />
          All my students ({people.length})
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="to"
            checked={mode === "some"}
            onChange={() => setMode("some")}
          />
          Selected students{mode === "some" ? ` (${picked.size} chosen)` : ""}
        </label>
      </fieldset>

      {mode === "some" && (
        <div className="space-y-2 rounded-lg border p-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={find}
              onChange={(e) => setFind(e.target.value)}
              placeholder="Search by name, ID, branch or section"
              aria-label="Search students"
              className="max-w-xs"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setPicked((all) => new Set([...all, ...shown.map((p) => p.id)]))}
            >
              Select all shown
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setPicked(new Set())}>
              Clear
            </Button>
          </div>
          <ul className="max-h-56 divide-y overflow-y-auto text-sm" aria-label="Students">
            {shown.map((p) => (
              <li key={p.id}>
                <label className="flex cursor-pointer items-center gap-2 px-1 py-1.5">
                  <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.id}
                    {p.branch ? ` · ${p.branch}` : ""}
                    {p.section ? ` ${p.section}` : ""}
                  </span>
                </label>
              </li>
            ))}
            {!shown.length && (
              <li className="px-1 py-2 text-muted-foreground">No student matches.</li>
            )}
          </ul>
          {people.length > SHOWN && (
            <p className="text-xs text-muted-foreground">
              Showing the first {SHOWN} matches. Search to narrow the list.
            </p>
          )}
        </div>
      )}

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        maxLength={2000}
        aria-label="Message"
        placeholder="Write your message…"
      />
      <FileField value={file} onChange={setFile} label="Attach a file" disabled={busy} />
      {done && (
        <p role="status" className="rounded-lg bg-primary/10 p-2 text-sm text-primary">
          {done}
        </p>
      )}
      <div className="mt-auto flex items-center gap-3">
        <Button type="submit" disabled={busy || !ready}>
          <Send /> Send to {count} student{count === 1 ? "" : "s"}
        </Button>
        {!people.length && (
          <span className="text-xs text-muted-foreground">
            No student with a login is assigned to you yet.
          </span>
        )}
      </div>
    </form>
  );
}
