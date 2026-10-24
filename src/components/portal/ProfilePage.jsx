import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SectionTitle } from "@/components/widgets";
import { PageTitle } from "@/components/portal/PortalShell";
import { PowerBiDashboards } from "@/components/portal/PowerBiDashboards";
import { updateMyProfile } from "@/lib/campus.functions";
import { saveMyLeetcodeUsername } from "@/lib/leetcode.functions";
import { useAccount } from "@/lib/account";
import { useCampus } from "@/lib/use-campus";
import { useLeetcodeProfile } from "@/lib/use-leetcode";

const card = "surface p-5";
const ROLE_LABEL = { student: "Student", faculty: "Teacher", admin: "Administrator" };

function Field({ label, children, hint }) {
  return (
    <label className="block text-sm">
      {label}
      <div className="mt-2">{children}</div>
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Fact({ label, value }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{value || "—"}</dd>
    </div>
  );
}

function LeetCodeCard({ studentId }) {
  const { data: profile, isLoading } = useLeetcodeProfile(studentId);
  const save = useServerFn(saveMyLeetcodeUsername);
  const qc = useQueryClient();
  const [editing, setEditing] = useState(!profile && !isLoading);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function submit(e) {
    e.preventDefault();
    const username = String(new FormData(e.currentTarget).get("username")).trim();
    setBusy(true);
    setMsg("");
    try {
      await save({ data: { username } });
      await Promise.all(
        [
          ["leetcode", studentId],
          ["prediction"],
          ["prediction-inputs"],
          ["learned"],
          ["agent-plans"],
        ].map((queryKey) => qc.invalidateQueries({ queryKey })),
      );
      setEditing(false);
      setMsg("LeetCode account linked.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not link that account.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`${card} mt-4`}>
      <SectionTitle sub="Used to show your solved problems, ranking and contest results on your profile">
        LeetCode account
      </SectionTitle>
      {msg && (
        <p role="status" className="mb-3 text-sm text-muted-foreground">
          {msg}
        </p>
      )}
      {!isLoading && profile && !editing ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Fact label="Username" value={profile.username} />
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil /> Change
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
          <Field
            label="LeetCode username"
            hint="Your public LeetCode handle, e.g. the part after leetcode.com/u/"
          >
            <Input name="username" required maxLength={50} defaultValue={profile?.username} />
          </Field>
          <Button type="submit" disabled={busy}>
            <Save /> {profile ? "Update" : "Link account"}
          </Button>
        </form>
      )}
    </div>
  );
}

export function ProfilePage() {
  const { profile, role, isAdmin, isFaculty, myRow, refresh } = useCampus();
  const account = useAccount();
  const save = useServerFn(updateMyProfile);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const targetRoles = myRow?.s.targetRoles ?? [];
  const roles = ["student", ...(isFaculty ? ["faculty"] : []), ...(isAdmin ? ["admin"] : [])];

  async function submit(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setMsg("");
    try {
      await save({
        data: {
          displayName: String(f.get("name")),
          phone: String(f.get("phone")),
          address: String(f.get("address")),
          bio: String(f.get("bio")),
          linkedin: String(f.get("linkedin")),
          github: String(f.get("github")),
          targetRoles: myRow
            ? String(f.get("roles"))
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean)
            : [],
        },
      });
      await refresh();
      await account.refresh();
      setEditing(false);
      setMsg("Profile updated.");
    } catch (err) {
      const issue = err?.issues?.[0];
      setMsg(
        issue
          ? `${issue.path?.join(" › ")}: ${issue.message}`
          : err instanceof Error
            ? err.message
            : "Could not save.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageTitle title="Profile" sub="Your details and your Power BI dashboards">
        {!editing && (
          <Button onClick={() => setEditing(true)}>
            <Pencil /> Edit profile
          </Button>
        )}
      </PageTitle>
      {msg && (
        <p role="status" className="mb-4 rounded-md border bg-muted/40 p-3 text-sm">
          {msg}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <SectionTitle sub="Set when your account was created">Account</SectionTitle>
          <dl className="grid grid-cols-2 gap-4">
            <Fact label="Email" value={profile.email} />
            <Fact label="Access" value={roles.map((r) => ROLE_LABEL[r]).join(", ")} />
            <Fact label="Member since" value={new Date(profile.created_at).toLocaleDateString()} />
          </dl>
          <Button asChild variant="link" className="mt-3 px-0">
            <Link to="/reset-password">Change password</Link>
          </Button>
        </div>
        {myRow && (
          <div className={card}>
            <SectionTitle sub="Kept by your campus. Ask your teacher or an administrator to correct anything wrong.">
              Academic details
            </SectionTitle>
            <dl className="grid grid-cols-2 gap-4">
              <Fact label="Student ID" value={myRow.s.id} />
              <Fact label="Branch" value={myRow.s.branch === "Not set" ? "" : myRow.s.branch} />
              <Fact label="Semester" value={String(myRow.s.semester)} />
              <Fact label="Graduating" value={String(myRow.s.gradYear)} />
              <Fact
                label="Mentor"
                value={myRow.mentorName ? `${myRow.mentorName} (${myRow.mentorEmail})` : ""}
              />
            </dl>
          </div>
        )}
      </div>

      <div className={`${card} mt-4`}>
        <SectionTitle sub="You can change these yourself">Personal details</SectionTitle>
        {!editing ? (
          <dl className="grid gap-4 sm:grid-cols-2">
            <Fact label="Name" value={profile.display_name} />
            <Fact label="Phone" value={profile.phone} />
            <Fact label="Address" value={profile.address} />
            <Fact label="LinkedIn" value={profile.linkedin_url} />
            <Fact label="GitHub" value={profile.github_url} />
            {myRow && <Fact label="Roles I am aiming for" value={targetRoles.join(", ")} />}
            <div className="sm:col-span-2">
              <Fact label="About me" value={profile.bio} />
            </div>
          </dl>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name">
                <Input name="name" required maxLength={100} defaultValue={profile.display_name} />
              </Field>
              <Field label="Phone">
                <Input name="phone" maxLength={30} defaultValue={profile.phone} />
              </Field>
              <Field label="LinkedIn link" hint="Starts with https://">
                <Input
                  name="linkedin"
                  maxLength={200}
                  defaultValue={profile.linkedin_url}
                  placeholder="https://www.linkedin.com/in/…"
                />
              </Field>
              <Field label="GitHub link" hint="Starts with https://">
                <Input
                  name="github"
                  maxLength={200}
                  defaultValue={profile.github_url}
                  placeholder="https://github.com/…"
                />
              </Field>
            </div>
            <Field label="Address">
              <Input name="address" maxLength={300} defaultValue={profile.address} />
            </Field>
            {myRow && (
              <Field
                label="Roles I am aiming for"
                hint="Separate with commas, up to 5. Example: Software Engineer, Data Analyst"
              >
                <Input name="roles" defaultValue={targetRoles.join(", ")} />
              </Field>
            )}
            <Field label="About me">
              <Textarea name="bio" maxLength={600} rows={4} defaultValue={profile.bio} />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                <Save /> Save changes
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
      {myRow && <LeetCodeCard studentId={myRow.s.id} />}
      <PowerBiDashboards />
      {role !== "student" && (
        <p className="mt-4 text-xs text-muted-foreground">
          Your email and access level are managed by an administrator.
        </p>
      )}
    </div>
  );
}
