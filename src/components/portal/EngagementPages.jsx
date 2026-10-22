import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  CalendarDays,
  ExternalLink,
  Plus,
  Trash2,
  Trophy,
  Users,
  Award,
  Code2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, SectionTitle } from "@/components/widgets";
import {
  ConfirmDialog,
  ErrorState,
  Field,
  PageSkeleton,
  StatusPill,
  inputClass,
  useAction,
} from "@/components/ui-kit";
import {
  confirmParticipation,
  loadParticipants,
  postOpportunity,
  removeOpportunity,
  updateParticipation,
} from "@/lib/platform.functions";
import { useOpportunities, useRefreshAll } from "@/lib/use-platform";

export const TYPES = [
  { key: "event", label: "Events", singular: "event", icon: CalendarDays },
  { key: "club", label: "Clubs", singular: "club", icon: Users },
  { key: "hackathon", label: "Hackathons", singular: "hackathon", icon: Code2 },
  { key: "certification", label: "Certifications", singular: "certification", icon: Award },
];

const STATUSES = [
  ["interested", "Interested"],
  ["applied", "Applied"],
  ["participating", "Taking part"],
  ["completed", "Completed"],
];

function Detail({ label, children }) {
  if (!children) return null;
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-label">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function OpportunityDetails({ o }) {
  return (
    <dl className="mt-3 grid gap-2 sm:grid-cols-2">
      <Detail label="Purpose">{o.purpose}</Detail>
      <Detail label="Benefits">{o.benefits}</Detail>
      <Detail label="Requirements">{o.requirements}</Detail>
      <Detail label="Eligibility">{o.eligibility}</Detail>
      <Detail label="How to apply">{o.how_to_apply}</Detail>
      <Detail label="Deadline">{o.deadline}</Detail>
    </dl>
  );
}

function ParticipationControl({ o, refresh }) {
  const p = o.participation;
  const [status, setStatus] = useState(p?.status ?? "interested");
  const [evidence, setEvidence] = useState(p?.evidence ?? "");
  const { busy, run } = useAction(refresh);
  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => updateParticipation({ data: { opportunityId: o.id, status, evidence } }),
          "Your status was saved.",
        );
      }}
    >
      <Field label="Your status">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={inputClass + " w-auto"}
        >
          {STATUSES.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      {status === "completed" && (
        <div className="min-w-48 flex-1">
          <Field
            label="Evidence for your teacher"
            hint="A certificate name, project link or short note."
          >
            <Input value={evidence} onChange={(e) => setEvidence(e.target.value)} maxLength={500} />
          </Field>
        </div>
      )}
      <Button type="submit" size="sm" disabled={busy}>
        Save status
      </Button>
      {p && (
        <StatusPill
          tone={p.verified ? "success" : p.status === "completed" ? "warning" : "neutral"}
        >
          {p.verified
            ? "Verified by your teacher"
            : p.status === "completed"
              ? "Awaiting verification"
              : "Not completed yet"}
        </StatusPill>
      )}
    </form>
  );
}

function StudentOpportunities() {
  const { data, isLoading, error, refetch } = useOpportunities();
  const refresh = useRefreshAll();
  const [type, setType] = useState("event");
  if (isLoading) return <PageSkeleton rows={2} />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const list = data.filter((o) => o.type === type);
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Opportunity type">
        {TYPES.map((t) => (
          <Button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={type === t.key}
            size="sm"
            variant={type === t.key ? "default" : "outline"}
            onClick={() => setType(t.key)}
          >
            <t.icon /> {t.label} ({data.filter((o) => o.type === t.key).length})
          </Button>
        ))}
      </div>
      {!list.length ? (
        <EmptyState
          title={`No ${type}s posted yet`}
          hint="Your teachers and the administration post opportunities here."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.map((o) => (
            <article key={o.id} className="surface p-4" aria-label={o.title}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="font-display text-lg font-semibold">{o.title}</h3>
                <StatusPill tone={o.open ? "success" : "neutral"}>
                  {o.open ? "Open" : "Closed"}
                </StatusPill>
              </div>
              <OpportunityDetails o={o} />
              {o.link && (
                <Button asChild size="sm" variant="outline" className="mt-3">
                  <a href={o.link} target="_blank" rel="noopener noreferrer">
                    <ExternalLink /> More information
                  </a>
                </Button>
              )}
              <ParticipationControl
                key={o.participation?.status ?? "none"}
                o={o}
                refresh={refresh}
              />
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- teacher
function OpportunityForm({ onDone }) {
  const empty = {
    type: "event",
    title: "",
    purpose: "",
    benefits: "",
    requirements: "",
    eligibility: "",
    howToApply: "",
    deadline: "",
    link: "",
  };
  const [f, setF] = useState(empty);
  const { busy, run } = useAction(onDone);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const area = (k, label) => (
    <Field label={label}>
      <Textarea value={f[k]} onChange={set(k)} rows={2} maxLength={1500} />
    </Field>
  );
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await run(() => postOpportunity({ data: f }), "Posted. Students were notified.");
        if (r.ok) setF(empty);
      }}
    >
      <Field label="Type">
        <select value={f.type} onChange={set("type")} className={inputClass}>
          {TYPES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.singular}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Title">
        <Input value={f.title} onChange={set("title")} required minLength={3} maxLength={150} />
      </Field>
      {area("purpose", "Purpose")}
      {area("benefits", "Benefits")}
      {area("requirements", "Requirements")}
      {area("eligibility", "Eligibility")}
      {area("howToApply", "How to apply")}
      <div className="grid gap-3">
        <Field label="Deadline (optional)">
          <Input type="date" value={f.deadline} onChange={set("deadline")} />
        </Field>
        <Field label="Link (https://, optional)">
          <Input type="url" value={f.link} onChange={set("link")} placeholder="https://" />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={busy}>
          <Plus /> Post opportunity
        </Button>
      </div>
    </form>
  );
}

function Participants({ o, refresh }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [opened, setOpened] = useState(false);
  const load = async () => {
    try {
      setRows(await loadParticipants({ data: { opportunityId: o.id } }));
    } catch (e) {
      setError(e);
    }
  };
  const { busy, run } = useAction(async () => {
    await load();
    await refresh();
  });
  if (!opened)
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          setOpened(true);
          load();
        }}
      >
        Participants ({o.stats.participants})
        {o.stats.to_verify > 0 && ` · ${o.stats.to_verify} to verify`}
      </Button>
    );
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!rows) return <PageSkeleton rows={1} />;
  return (
    <div className="mt-2 w-full overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th className="p-2">Student</th>
            <th>Status</th>
            <th>Evidence</th>
            <th>Verification</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.student_id} className="border-t align-top">
              <td className="p-2">
                <Link
                  to="/portal/students/$id"
                  params={{ id: p.student_id }}
                  className="text-primary hover:underline"
                >
                  {p.name}
                </Link>
              </td>
              <td>{p.status}</td>
              <td className="max-w-48 break-words text-muted-foreground">{p.evidence || "—"}</td>
              <td>
                {p.status === "completed" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant={p.verified ? "outline" : "default"}
                    disabled={busy}
                    onClick={() =>
                      run(
                        () =>
                          confirmParticipation({
                            data: {
                              opportunityId: o.id,
                              studentId: p.student_id,
                              verified: !p.verified,
                            },
                          }),
                        p.verified
                          ? "Verification removed."
                          : "Verified. It now counts towards engagement.",
                      )
                    }
                  >
                    {p.verified ? "Remove verification" : "Verify"}
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">Not completed</span>
                )}
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={4} className="p-3 text-muted-foreground">
                None of your students have joined yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function StaffOpportunities() {
  const { data, isLoading, error, refetch } = useOpportunities();
  const refresh = useRefreshAll();
  const { run } = useAction(refresh);
  const [removing, setRemoving] = useState(null);
  return (
    <div className="space-y-6">
      <section className="surface p-4">
        <SectionTitle sub="Students see the purpose, benefits, requirements and how to apply">
          Post an event, club, hackathon or certification
        </SectionTitle>
        <OpportunityForm onDone={refresh} />
      </section>
      <section>
        <SectionTitle sub="Verify completed activities so they count towards each student's engagement score">
          Posted opportunities
        </SectionTitle>
        {isLoading ? (
          <PageSkeleton rows={2} />
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : !data.length ? (
          <EmptyState title="Nothing posted yet" />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {data.map((o) => (
              <article key={o.id} className="surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-lg font-semibold">{o.title}</h3>
                  <StatusPill tone={o.open ? "success" : "neutral"}>
                    {o.type} · {o.open ? "open" : "closed"}
                  </StatusPill>
                </div>
                <OpportunityDetails o={o} />
                <div className="mt-3 flex flex-wrap items-start gap-2">
                  <Participants o={o} refresh={refresh} />
                  <Button type="button" size="sm" variant="ghost" onClick={() => setRemoving(o)}>
                    <Trash2 /> Remove
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(v) => !v && setRemoving(null)}
        title={`Remove "${removing?.title ?? ""}"?`}
        description="Students' participation records for it are deleted. Activities already verified stay on their records."
        confirmLabel="Remove"
        onConfirm={() => run(() => removeOpportunity({ data: { id: removing.id } }), "Removed.")}
      />
    </div>
  );
}

export function Opportunities({ staff }) {
  return (
    <section className="mt-8">
      <SectionTitle
        sub={
          staff
            ? "Create opportunities and verify what students complete"
            : "Events, clubs, hackathons and certifications you can join"
        }
      >
        <span className="inline-flex items-center gap-2">
          <Trophy className="size-5 text-primary" /> Opportunities
        </span>
      </SectionTitle>
      {staff ? <StaffOpportunities /> : <StudentOpportunities />}
    </section>
  );
}
