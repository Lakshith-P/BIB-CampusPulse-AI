import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Link2, Lock, Send, ShieldCheck, ShieldQuestion, Star, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, SectionTitle } from "@/components/widgets";
import {
  ErrorState,
  Field,
  PageSkeleton,
  StatusPill,
  inputClass,
  useAction,
} from "@/components/ui-kit";
import { PageTitle, RoleGate } from "@/components/portal/PortalShell";
import {
  answerComplaint,
  assignComplaintToMe,
  sendComplaint,
  sendRating,
  sendSubjectReview,
  verifyChainIntegrity,
} from "@/lib/platform.functions";
import {
  useAllComplaints,
  useComplaintChain,
  useMyComplaints,
  useMyRatings,
  useMySubjectReviews,
  useRefreshAll,
  useSubjectReviewSummary,
} from "@/lib/use-platform";
import { LiveFeedback } from "@/components/student-profile/LiveStudentProfile";
import { useCampus } from "@/lib/use-campus";

const DIMENSIONS = [
  ["teaching", "Quality of teaching"],
  ["content", "Course content and materials"],
  ["support", "Mentor and staff support"],
  ["facilities", "Campus facilities"],
];

function StarInput({ name, label, value, onChange }) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{label}</legend>
      <div className="mt-1 flex gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              className="peer sr-only"
              required
            />
            <span
              className={`flex size-9 items-center justify-center rounded-md border text-sm font-semibold transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring ${
                value >= n
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card hover:bg-accent"
              }`}
            >
              {n}
              <span className="sr-only"> out of 5</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Satisfaction() {
  const refresh = useRefreshAll();
  const ratings = useMyRatings();
  const [v, setV] = useState({ teaching: 0, content: 0, support: 0, facilities: 0 });
  const [comment, setComment] = useState("");
  const { busy, run } = useAction(refresh);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form
        className="surface space-y-4 p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await run(
            () => sendRating({ data: { ...v, comment } }),
            "Thank you. Your ratings were saved.",
          );
          if (r.ok) {
            setV({ teaching: 0, content: 0, support: 0, facilities: 0 });
            setComment("");
          }
        }}
      >
        <SectionTitle sub="Rate each from 1 (poor) to 5 (excellent). You can share once a week.">
          How satisfied are you?
        </SectionTitle>
        {DIMENSIONS.map(([key, label]) => (
          <StarInput
            key={key}
            name={key}
            label={label}
            value={v[key]}
            onChange={(n) => setV({ ...v, [key]: n })}
          />
        ))}
        <Field label="Anything you would like to add? (optional)">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            maxLength={1000}
          />
        </Field>
        <Button type="submit" disabled={busy || Object.values(v).some((x) => !x)}>
          <Send /> Submit ratings
        </Button>
      </form>
      <section className="surface p-4">
        <SectionTitle sub="Teachers see the average, not your comment text">
          Your submissions
        </SectionTitle>
        {ratings.isLoading ? (
          <PageSkeleton rows={1} />
        ) : ratings.error ? (
          <ErrorState error={ratings.error} onRetry={ratings.refetch} />
        ) : !ratings.data.length ? (
          <p className="text-sm text-muted-foreground">You have not shared ratings yet.</p>
        ) : (
          <ul className="divide-y text-sm">
            {ratings.data.map((r) => (
              <li key={r.id} className="py-2">
                <p className="flex items-center gap-1 font-medium">
                  <Star className="size-4 text-warning" aria-hidden />
                  {((r.teaching + r.content + r.support + r.facilities) / 4).toFixed(1)} / 5
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Teaching {r.teaching} · Content {r.content} · Support {r.support} · Facilities{" "}
                  {r.facilities}
                </p>
                {r.comment && <p className="mt-1">{r.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const CATEGORY_LABEL = {
  academic: "Academic matter",
  faculty: "About a staff member",
  facilities: "Facilities",
  harassment: "Harassment or safety",
  other: "Something else",
};
const STATUS_TONE = { new: "warning", "in-review": "info", resolved: "success" };
const STATUS_LABEL = { new: "Received", "in-review": "Under review", resolved: "Resolved" };
const SEVERITY_TONE = { low: "neutral", medium: "warning", high: "danger" };
const SEVERITY_LABEL = { low: "Low", medium: "Medium", high: "High" };
const EVENT_LABEL = {
  CREATED: "Complaint filed",
  STATUS_CHANGED: "Status changed",
  REOPENED: "Reopened",
  ASSIGNED: "Assigned",
  SEVERITY_OVERRIDE: "Severity changed",
  RESOLUTION_EVIDENCE: "Resolution recorded",
};

/** The tamper-evident history of one complaint: every lifecycle event as a linked hash block.
 * Altering a stored block, or editing the complaint directly in the database, breaks the chain
 * — see the "Verify integrity" check on the complaints page. */
function AuditTrail({ id }) {
  const [open, setOpen] = useState(false);
  const chain = useComplaintChain(id, open);
  return (
    <div className="mt-3 border-t pt-3">
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(!open)}>
        <Link2 /> {open ? "Hide audit trail" : "View audit trail"}
      </Button>
      {open && (
        <div className="mt-2 space-y-2">
          {chain.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : chain.error ? (
            <p className="text-xs text-destructive">Could not load the audit trail.</p>
          ) : (
            chain.data.map((b) => (
              <div key={b.id} className="rounded-md border p-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{EVENT_LABEL[b.event_type] ?? b.event_type}</span>
                  <span className="text-muted-foreground">
                    {new Date(b.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-muted-foreground">{b.actor_name || b.actor_email || "System"}</p>
                <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                  hash {b.hash.slice(0, 16)}… · prev {b.prev_hash.slice(0, 16)}…
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Complaints() {
  const refresh = useRefreshAll();
  const mine = useMyComplaints();
  const [f, setF] = useState({ category: "academic", subject: "", body: "" });
  const { busy, run } = useAction(refresh);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form
        className="surface space-y-3 p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await run(
            () => sendComplaint({ data: f }),
            "Your complaint was sent to the administrators.",
          );
          if (r.ok) setF({ category: "academic", subject: "", body: "" });
        }}
      >
        <SectionTitle sub="Only you and the administrators can read this. Teachers and mentors cannot.">
          <span className="inline-flex items-center gap-2">
            <Lock className="size-4 text-primary" /> Confidential complaint
          </span>
        </SectionTitle>
        <Field label="What is it about?">
          <select value={f.category} onChange={set("category")} className={inputClass}>
            {Object.entries(CATEGORY_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Subject">
          <Input
            value={f.subject}
            onChange={set("subject")}
            required
            minLength={3}
            maxLength={150}
          />
        </Field>
        <Field
          label="Details"
          hint="At least 10 characters. Include dates and places where it helps."
        >
          <Textarea
            value={f.body}
            onChange={set("body")}
            rows={6}
            required
            minLength={10}
            maxLength={4000}
          />
        </Field>
        <Button type="submit" disabled={busy}>
          <Send /> Send confidentially
        </Button>
      </form>
      <section className="surface p-4">
        <SectionTitle sub="Responses from the administrators appear here">
          Your complaints
        </SectionTitle>
        {mine.isLoading ? (
          <PageSkeleton rows={1} />
        ) : mine.error ? (
          <ErrorState error={mine.error} onRetry={mine.refetch} />
        ) : !mine.data.length ? (
          <p className="text-sm text-muted-foreground">You have not filed any complaints.</p>
        ) : (
          <ul className="space-y-3">
            {mine.data.map((c) => (
              <li key={c.id} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{c.subject}</p>
                  <StatusPill tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</StatusPill>
                </div>
                <p className="text-xs text-muted-foreground">
                  {CATEGORY_LABEL[c.category]} · {new Date(c.created_at).toLocaleDateString()}
                </p>
                {c.response && (
                  <p className="mt-2 rounded-md bg-accent p-2 text-accent-foreground">
                    Response: {c.response}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- teacher review per subject
// The satisfaction form above rates the campus as a whole. This rates the teaching of each
// subject a student takes, one review per subject, which they can revise at any time.
const REVIEW_DIMENSIONS = [
  ["teaching", "Quality of teaching"],
  ["clarity", "Clarity of explanation"],
  ["support", "Support with doubts"],
  ["pace", "Pace of the course"],
];
const EMPTY_REVIEW = { teaching: 0, clarity: 0, support: 0, pace: 0, comment: "" };

function SubjectReview({ subject, review, onDone }) {
  const [v, setV] = useState(
    review
      ? {
          teaching: review.teaching,
          clarity: review.clarity,
          support: review.support,
          pace: review.pace,
          comment: review.comment,
        }
      : EMPTY_REVIEW,
  );
  const { busy, run } = useAction(onDone);
  const complete = REVIEW_DIMENSIONS.every(([k]) => v[k] > 0);
  return (
    <form
      className="surface space-y-3 p-4"
      aria-label={`Review of ${subject}`}
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => sendSubjectReview({ data: { subject, ...v } }),
          review ? "Your review was updated." : "Thank you. Your review was saved.",
        );
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-numeric text-lg font-semibold">{subject}</h3>
        {review ? (
          <StatusPill tone="success">
            Reviewed {new Date(review.updated_at).toLocaleDateString()} · {review.average} / 5
          </StatusPill>
        ) : (
          <StatusPill tone="neutral">Not reviewed yet</StatusPill>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {REVIEW_DIMENSIONS.map(([key, label]) => (
          <StarInput
            key={key}
            name={`${subject}-${key}`}
            label={label}
            value={v[key]}
            onChange={(n) => setV({ ...v, [key]: n })}
          />
        ))}
      </div>
      <Field label="Anything your teacher should know? (optional)">
        <Textarea
          value={v.comment}
          onChange={(e) => setV({ ...v, comment: e.target.value })}
          rows={2}
          maxLength={1000}
        />
      </Field>
      <Button type="submit" size="sm" disabled={busy || !complete}>
        <Send /> {review ? "Update review" : "Submit review"}
      </Button>
    </form>
  );
}

/** A student reviews the teaching of every subject on their record. */
function SubjectReviews() {
  const refresh = useRefreshAll();
  const { data, isLoading, error, refetch } = useMySubjectReviews();
  if (isLoading) return <PageSkeleton rows={2} />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data.subjects.length)
    return (
      <EmptyState
        title="No subjects on your record yet"
        hint="Once your subjects are recorded, you can review the teaching of each one here."
      />
    );
  const bySubject = new Map(data.reviews.map((r) => [r.subject, r]));
  return (
    <div className="space-y-4">
      <SectionTitle sub="One review per subject. Your teachers see the averages per subject, never who wrote what.">
        Teacher review for every subject
      </SectionTitle>
      <div className="grid gap-4 lg:grid-cols-2">
        {data.subjects.map((subject) => (
          <SubjectReview
            key={subject}
            subject={subject}
            review={bySubject.get(subject) ?? null}
            onDone={refresh}
          />
        ))}
      </div>
    </div>
  );
}

const score = (v) => (v === null ? "—" : `${v.toFixed(1)} / 5`);

/** What teachers and administrators see: the average of each subject's reviews. */
export function SubjectReviewSummary() {
  const { data, isLoading, error, refetch } = useSubjectReviewSummary();
  if (isLoading) return <PageSkeleton rows={2} />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data.length) return null;
  const reviewed = data.filter((r) => r.reviews > 0);
  return (
    <section className="surface mt-8 p-4" aria-label="Teacher review by subject">
      <SectionTitle sub="Averages of the reviews students wrote for each subject. Comments stay with the student.">
        Teacher review by subject
      </SectionTitle>
      {!reviewed.length ? (
        <p className="text-sm text-muted-foreground">
          No subject has been reviewed yet. Students write these from their Feedback page.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2">Subject</th>
                <th className="p-2">Reviews</th>
                {REVIEW_DIMENSIONS.map(([key, label]) => (
                  <th key={key} className="p-2">
                    {label}
                  </th>
                ))}
                <th className="p-2">Overall</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.subject} className="border-t">
                  <td className="p-2 font-medium">{r.subject}</td>
                  <td className="p-2 tabular-nums">{r.reviews}</td>
                  {REVIEW_DIMENSIONS.map(([key]) => (
                    <td key={key} className="p-2 tabular-nums">
                      {score(r[key])}
                    </td>
                  ))}
                  <td
                    className={`p-2 tabular-nums ${r.average !== null && r.average < 3 ? "font-semibold text-destructive" : ""}`}
                  >
                    {score(r.average)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function StudentFeedbackCentre({ s }) {
  const { refresh } = useCampus();
  const [tab, setTab] = useState("satisfaction");
  const tabs = [
    ["satisfaction", "Satisfaction ratings"],
    ["subjects", "Teacher review by subject"],
    ["notes", "Notes and teacher feedback"],
    ["complaint", "Confidential complaint"],
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Feedback centre">
        {tabs.map(([key, label]) => (
          <Button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            size="sm"
            variant={tab === key ? "default" : "outline"}
            onClick={() => setTab(key)}
          >
            {label}
          </Button>
        ))}
      </div>
      {tab === "satisfaction" && <Satisfaction />}
      {tab === "subjects" && <SubjectReviews />}
      {tab === "notes" && (
        <LiveFeedback s={s} isOwner canWriteFaculty={false} onChanged={refresh} />
      )}
      {tab === "complaint" && <Complaints />}
    </div>
  );
}

// ---------------------------------------------------------------- administrators
function ComplaintCard({ c, refresh, me }) {
  const [status, setStatus] = useState(c.status);
  const [response, setResponse] = useState(c.response);
  const [severity, setSeverity] = useState(c.severity);
  const { busy, run } = useAction(refresh);
  const assign = useServerFn(assignComplaintToMe);
  return (
    <article className="surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{c.subject}</h3>
        <div className="flex gap-1.5">
          <StatusPill tone={SEVERITY_TONE[c.severity]}>{SEVERITY_LABEL[c.severity]}</StatusPill>
          <StatusPill tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</StatusPill>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {CATEGORY_LABEL[c.category]} · from {c.author_name || c.author_email} ({c.author_email}) ·{" "}
        {new Date(c.created_at).toLocaleString()}
      </p>
      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        <UserCheck className="size-3.5" />
        {c.assigned_to
          ? c.assigned_to === me
            ? "Assigned to you"
            : `Assigned to ${c.assignee_name || c.assignee_email}`
          : "Unassigned"}
        {c.assigned_to !== me && (
          <Button
            type="button"
            size="sm"
            variant="link"
            className="h-auto p-0 text-xs"
            onClick={() => run(() => assign({ data: { id: c.id } }), "Assigned to you.")}
          >
            {c.assigned_to ? "Reassign to me" : "Assign to me"}
          </Button>
        )}
      </p>
      <p className="mt-2 whitespace-pre-wrap text-sm">{c.body}</p>
      <form
        className="mt-3 space-y-2 border-t pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => answerComplaint({ data: { id: c.id, status, response, severity } }),
            "Response saved.",
          );
        }}
      >
        <Field label="Response to the student">
          <Textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            rows={3}
            maxLength={3000}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Status"
            className={inputClass + " w-auto"}
          >
            {Object.entries(STATUS_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            aria-label="Severity"
            className={inputClass + " w-auto"}
          >
            {Object.entries(SEVERITY_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l} severity
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" disabled={busy}>
            Save response
          </Button>
        </div>
      </form>
      <AuditTrail id={c.id} />
    </article>
  );
}

function VerifyIntegrity() {
  const verify = useServerFn(verifyChainIntegrity);
  const [result, setResult] = useState(null);
  const { busy, run } = useAction();
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          const r = await run(() => verify());
          if (r.ok) setResult(r.result);
        }}
      >
        <ShieldQuestion /> Verify integrity
      </Button>
      {result && (
        <StatusPill tone={result.valid ? "success" : "danger"}>
          {result.valid
            ? `Chain intact — ${result.blocks} block(s), no tampering detected`
            : result.reason}
        </StatusPill>
      )}
    </div>
  );
}

export function ComplaintsPage() {
  const refresh = useRefreshAll();
  const all = useAllComplaints();
  const { profile } = useCampus();
  return (
    <RoleGate allow={["admin"]}>
      <PageTitle
        title="Confidential complaints"
        sub="Visible to administrators only. Notifications never include what was written."
      />
      <p className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="size-4 text-primary" />
        Handle these privately. Every status change, assignment and resolution is recorded in a
        tamper-evident hash chain, independent of the audit log.
      </p>
      <VerifyIntegrity />
      {all.isLoading ? (
        <PageSkeleton rows={3} />
      ) : all.error ? (
        <ErrorState error={all.error} onRetry={all.refetch} />
      ) : !all.data.length ? (
        <EmptyState title="No complaints" hint="Nothing is waiting for review." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {all.data.map((c) => (
            <ComplaintCard
              key={c.id + c.status + c.response.length + c.severity + c.assigned_to}
              c={c}
              refresh={refresh}
              me={profile.id}
            />
          ))}
        </div>
      )}
      <p className="mt-6 text-xs text-muted-foreground">
        Students file complaints from{" "}
        <Link to="/portal/feedback" className="underline">
          Feedback
        </Link>
        .
      </p>
    </RoleGate>
  );
}
