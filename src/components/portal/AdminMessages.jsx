import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SectionTitle } from "@/components/widgets";
import { Field, inputClass, useAction } from "@/components/ui-kit";
import { listAccounts } from "@/lib/campus.functions";
import { loadAdminMessages, postAdminMessage } from "@/lib/access.functions";

const AUDIENCE = {
  students: "All students",
  teachers: "All teachers",
  everyone: "Everyone",
  person: "One person",
};
const SENT = ["admin-messages"];

/**
 * Where an administrator posts a message. It reaches the chosen people as a notification, and the
 * list below keeps what was sent. `replyTo` ({ userId, name }) opens it addressed to one person,
 * for answering a message from the Contact page.
 */
export function AdminMessages({ replyTo, onClearReply }) {
  const qc = useQueryClient();
  const { busy, run } = useAction();
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: () => listAccounts() });
  const sent = useQuery({ queryKey: SENT, queryFn: () => loadAdminMessages() });
  const [audience, setAudience] = useState("students");
  const [userId, setUserId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [done, setDone] = useState("");

  // a reply addresses the message to that person
  useEffect(() => {
    if (!replyTo) return;
    setAudience("person");
    setUserId(replyTo.userId);
    setDone("");
  }, [replyTo]);

  const people = (accounts.data ?? []).filter((a) => a.roles.length);
  const ready = body.trim() && (audience !== "person" || userId);

  return (
    <section className="space-y-4" aria-label="Post a message">
      <form
        className="surface space-y-3 p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setDone("");
          const r = await run(() =>
            postAdminMessage({
              data: { audience, ...(audience === "person" ? { userId } : {}), subject, body },
            }),
          );
          if (r.ok) {
            setDone(
              `Posted to ${r.result.to}: ${r.result.sent} ${r.result.sent === 1 ? "person" : "people"} notified.`,
            );
            setBody("");
            setSubject("");
            onClearReply?.();
            qc.invalidateQueries({ queryKey: SENT });
          }
        }}
      >
        <SectionTitle sub="Everyone you choose gets it as a notification in the portal.">
          <Megaphone className="mr-2 inline size-4" /> Post a message
        </SectionTitle>
        {replyTo && (
          <p className="rounded-md bg-muted p-2 text-sm">
            Replying to <b>{replyTo.name}</b>.{" "}
            <button type="button" className="underline" onClick={onClearReply}>
              Cancel reply
            </button>
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="To">
            <select
              className={inputClass}
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              aria-label="To"
            >
              {Object.entries(AUDIENCE).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          {audience === "person" && (
            <Field label="Person">
              <select
                className={inputClass}
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                aria-label="Person"
              >
                <option value="">Choose a person</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || p.email} ({p.email})
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className={audience === "person" ? "sm:col-span-2" : ""}>
            <Field label="Subject (optional)">
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} />
            </Field>
          </div>
        </div>
        <Field label="Message">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            maxLength={2000}
            required
          />
        </Field>
        {done && (
          <p role="status" className="rounded-md bg-primary/10 p-2 text-sm text-primary">
            {done}
          </p>
        )}
        <Button type="submit" disabled={busy || !ready}>
          <Send /> Post message
        </Button>
      </form>

      <div>
        <p className="mb-2 text-sm font-medium">Messages you have posted</p>
        {sent.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing posted yet.</p>
        )}
        <ul className="divide-y rounded-md border text-sm" aria-label="Posted messages">
          {(sent.data ?? []).map((m) => (
            <li key={m.id} className="p-3">
              <p className="font-medium">
                {m.subject || "Message"}{" "}
                <span className="font-normal text-muted-foreground">
                  · to {m.recipient_label} ({m.recipients}) · {m.sender} ·{" "}
                  {new Date(m.created_at).toLocaleString()}
                </span>
              </p>
              <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
