import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Mail, UserPlus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { listAccounts } from "@/lib/campus.functions";
import {
  decidePasswordRequest,
  loadMailStatus,
  loadPasswordRequests,
  registerAccounts,
} from "@/lib/access.functions";
import { REGISTRATION_TEMPLATE, parseRegistrationCsv } from "@/lib/registration-csv";
import { saveBlob } from "@/lib/save-file";

const REQUESTS = ["password-requests"];

function MailNotice() {
  const { data } = useQuery({ queryKey: ["mail-status"], queryFn: () => loadMailStatus() });
  if (!data) return null;
  return data.ready ? (
    <p className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
      <Mail className="size-4 shrink-0 text-primary" aria-hidden />
      Email is set up. Each person receives their login, with a generated password, at their own
      email address.
    </p>
  ) : (
    <p role="note" className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
      Email is not set up on this server yet (set <b>SMTP_URL</b>, <b>APP_URL</b> and{" "}
      <b>MAIL_FROM</b>). Until it is, a generated password is shown here once for each person, so
      you can give it to them privately.
    </p>
  );
}

const OUTCOME = {
  created: ["success", "Registered"],
  exists: ["neutral", "Already registered"],
  failed: ["danger", "Not registered"],
};

/** What happened to each person, with any password that could not be emailed. */
function Results({ outcome }) {
  const handover = outcome.results.filter((r) => r.password);
  return (
    <section className="surface space-y-3 p-4" aria-label="Registration results">
      <SectionTitle
        sub={`${outcome.created} registered · ${outcome.emailed} emailed · ${outcome.skipped} already existed · ${outcome.failed} failed`}
      >
        Results
      </SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-2">Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Result</th>
              <th>Password</th>
            </tr>
          </thead>
          <tbody>
            {outcome.results.map((r) => (
              <tr key={r.email} className="border-t align-top">
                <td className="py-2">{r.name}</td>
                <td>{r.email}</td>
                <td>{r.role === "faculty" ? "Teacher" : "Student"}</td>
                <td>
                  <StatusPill tone={OUTCOME[r.status][0]}>
                    {r.emailed ? "Registered and emailed" : OUTCOME[r.status][1]}
                  </StatusPill>
                  {r.reason && <p className="mt-1 text-xs text-muted-foreground">{r.reason}</p>}
                  {r.mailError && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      The email failed: {r.mailError}
                    </p>
                  )}
                </td>
                <td className="font-mono text-xs">
                  {r.password ?? (r.emailed ? "Sent by email" : "")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {handover.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-muted-foreground">
            These passwords were not emailed and are shown only now. Give them out privately.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              saveBlob(
                new Blob(
                  [
                    "name,email,role,password\r\n" +
                      handover
                        .map((r) =>
                          [r.name, r.email, r.role, r.password].map((v) => `"${v}"`).join(","),
                        )
                        .join("\r\n"),
                  ],
                  { type: "text/csv" },
                ),
                "slqg-credentials.csv",
              )
            }
          >
            <Download /> Download these logins
          </Button>
        </div>
      )}
    </section>
  );
}

function ManualForm({ teachers, onDone }) {
  const empty = {
    role: "student",
    name: "",
    email: "",
    studentId: "",
    course: "",
    branch: "",
    section: "",
    semester: "",
    gradYear: "",
    teacherEmail: "",
  };
  const [f, setF] = useState(empty);
  const { busy, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const student = f.role === "student";
  return (
    <form
      className="surface grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const person = {
          role: f.role,
          name: f.name,
          email: f.email,
          ...(student
            ? {
                ...(f.studentId && { studentId: f.studentId }),
                ...(f.course && { course: f.course }),
                ...(f.branch && { branch: f.branch }),
                ...(f.section && { section: f.section }),
                ...(f.semester && { semester: Number(f.semester) }),
                ...(f.gradYear && { gradYear: Number(f.gradYear) }),
                ...(f.teacherEmail && { teacherEmail: f.teacherEmail }),
              }
            : {}),
        };
        const r = await run(() => registerAccounts({ data: { people: [person] } }));
        if (r.ok) {
          onDone(r.result);
          if (r.result.created) setF(empty);
        }
      }}
    >
      <div className="sm:col-span-2 lg:col-span-4">
        <SectionTitle sub="The system makes a password and sends it to the email address below.">
          Register one person
        </SectionTitle>
      </div>
      <Field label="Role">
        <select className={inputClass} value={f.role} onChange={set("role")}>
          <option value="student">Student</option>
          <option value="faculty">Teacher</option>
        </select>
      </Field>
      <Field label="Full name">
        <Input value={f.name} onChange={set("name")} required minLength={2} maxLength={100} />
      </Field>
      <Field label="Email (their login)">
        <Input type="email" value={f.email} onChange={set("email")} required maxLength={254} />
      </Field>
      {student && (
        <>
          <Field label="Student ID (optional)">
            <Input value={f.studentId} onChange={set("studentId")} maxLength={40} />
          </Field>
          <Field label="Course">
            <Input value={f.course} onChange={set("course")} maxLength={60} placeholder="B.Tech" />
          </Field>
          <Field label="Branch">
            <Input value={f.branch} onChange={set("branch")} maxLength={60} placeholder="CSE" />
          </Field>
          <Field label="Section">
            <Input value={f.section} onChange={set("section")} maxLength={20} />
          </Field>
          <Field label="Semester">
            <Input type="number" min={1} max={8} value={f.semester} onChange={set("semester")} />
          </Field>
          <Field label="Graduation year">
            <Input
              type="number"
              min={2020}
              max={2040}
              value={f.gradYear}
              onChange={set("gradYear")}
            />
          </Field>
          <Field label="Assigned teacher (optional)">
            <select
              className={inputClass}
              value={f.teacherEmail}
              onChange={set("teacherEmail")}
              aria-label="Assigned teacher"
            >
              <option value="">No teacher yet</option>
              {teachers.map((t) => (
                <option key={t.email} value={t.email}>
                  {t.name || t.email}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}
      <div className="flex items-end sm:col-span-2 lg:col-span-4">
        <Button type="submit" disabled={busy}>
          <UserPlus /> Register and send login
        </Button>
      </div>
    </form>
  );
}

function BulkForm({ onDone }) {
  const [parsed, setParsed] = useState(null);
  const { busy, run } = useAction();
  const good = parsed?.rows.filter((r) => r.user) ?? [];
  const bad = parsed?.rows.filter((r) => !r.user) ?? [];
  return (
    <section className="surface space-y-3 p-4" aria-label="Register from a CSV file">
      <SectionTitle sub="One row per person. Students can have a student ID, course, branch, section, semester, graduation year and a teacher's email.">
        Register many people from a CSV
      </SectionTitle>
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
          <Upload className="size-4" aria-hidden /> Choose CSV file
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            aria-label="CSV file of people to register"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) setParsed(parseRegistrationCsv(await file.text()));
            }}
          />
        </label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            saveBlob(
              new Blob([REGISTRATION_TEMPLATE], { type: "text/csv" }),
              "register-people-template.csv",
            )
          }
        >
          <Download /> Download a template
        </Button>
      </div>
      {parsed?.fileErrors.map((e) => (
        <p key={e} role="alert" className="text-sm text-destructive">
          {e}
        </p>
      ))}
      {parsed && !parsed.fileErrors.length && (
        <>
          <p className="text-sm">
            <b>{good.length}</b> ready to register
            {bad.length > 0 && (
              <>
                , <b className="text-destructive">{bad.length}</b> with problems that will be
                skipped
              </>
            )}
            .
          </p>
          {bad.length > 0 && (
            <ul className="list-disc pl-5 text-sm text-destructive">
              {bad.map((r) => (
                <li key={r.line}>
                  Line {r.line}: {r.errors.join(" ")}
                </li>
              ))}
            </ul>
          )}
          <Button
            type="button"
            disabled={busy || !good.length}
            onClick={async () => {
              const r = await run(() =>
                registerAccounts({ data: { people: good.map((x) => x.user) } }),
              );
              if (r.ok) {
                setParsed(null);
                onDone(r.result);
              }
            }}
          >
            <UserPlus /> Register {good.length} and send logins
          </Button>
        </>
      )}
    </section>
  );
}

function Register() {
  const [outcome, setOutcome] = useState(null);
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: () => listAccounts() });
  const qc = useQueryClient();
  const teachers = (accounts.data ?? []).filter((a) => a.roles.includes("faculty"));
  const done = (result) => {
    setOutcome(result);
    qc.invalidateQueries({ queryKey: ["accounts"] });
    qc.invalidateQueries({ queryKey: ["campus"] });
  };
  return (
    <div className="space-y-4">
      <MailNotice />
      <ManualForm teachers={teachers} onDone={done} />
      <BulkForm onDone={done} />
      {outcome && <Results outcome={outcome} />}
    </div>
  );
}

const KIND = { forgot: "Forgot password", change: "Password change" };
const STATUS_TONE = {
  pending: "warning",
  approved: "success",
  rejected: "neutral",
  completed: "success",
};
const statusLabel = (r) =>
  r.status === "approved"
    ? r.waiting
      ? "Approved, waiting for them to set it"
      : "Approved"
    : r.status === "completed"
      ? "New password set"
      : r.status === "rejected"
        ? "Rejected"
        : "Waiting";

function PasswordRequests({ requests }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: REQUESTS });
  const { busy, run } = useAction(refresh);
  if (requests.error) return <ErrorState error={requests.error} onRetry={requests.refetch} />;
  if (!requests.data) return <PageSkeleton rows={2} />;
  if (!requests.data.length)
    return (
      <EmptyState
        title="No password requests"
        hint="Forgot-password and password-change requests from students and teachers appear here."
      />
    );
  const decide = (id, decision) =>
    run(
      () => decidePasswordRequest({ data: { id, decision } }),
      decision === "approve"
        ? "Approved. They can now set a new password from the login page."
        : "Request rejected.",
    );
  return (
    <ul className="divide-y rounded-xl border bg-card text-sm" aria-label="Password requests">
      {requests.data.map((r) => (
        <li key={r.id} className="space-y-2 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium">
                {r.name} <span className="text-xs text-muted-foreground">{r.email}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {KIND[r.kind]} · {r.roles.includes("faculty") ? "Teacher" : "Student"} ·{" "}
                {new Date(r.createdAt).toLocaleString()}
              </p>
            </div>
            {r.status === "pending" ? (
              <span className="flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => decide(r.id, "approve")}>
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => decide(r.id, "reject")}
                >
                  Reject
                </Button>
              </span>
            ) : (
              <StatusPill tone={STATUS_TONE[r.status]}>{statusLabel(r)}</StatusPill>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Administrator page: register students and teachers, and decide password requests. */
export function AccessPage() {
  const [tab, setTab] = useState("register");
  const requests = useQuery({
    queryKey: REQUESTS,
    queryFn: () => loadPasswordRequests(),
    refetchInterval: 15000,
  });
  const pending = requests.data?.filter((r) => r.status === "pending").length ?? 0;
  return (
    <RoleGate allow={["admin"]}>
      <PageTitle
        title="Login credentials"
        sub="Choose who can log in: register students and teachers, and approve forgot-password and password-change requests. There is no self sign-up."
      />
      <div className="mb-4 flex gap-2" role="tablist" aria-label="Login credentials">
        {[
          ["register", "Register people"],
          ["requests", `Password requests${pending ? ` (${pending})` : ""}`],
        ].map(([key, label]) => (
          <Button
            key={key}
            type="button"
            role="tab"
            size="sm"
            aria-selected={tab === key}
            variant={tab === key ? "default" : "outline"}
            onClick={() => setTab(key)}
          >
            {label}
          </Button>
        ))}
      </div>
      {tab === "register" ? <Register /> : <PasswordRequests requests={requests} />}
    </RoleGate>
  );
}
