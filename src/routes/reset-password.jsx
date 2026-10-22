import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/PublicLayout";
import { pageHead } from "@/lib/metadata";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useAccount } from "@/lib/account";
import { changePassword } from "@/lib/auth.functions";
export const Route = createFileRoute("/reset-password")({
  head: () => pageHead("Change Password", "Change your BIB InsightIQ account password."),
  component: ChangePassword,
});
function ChangePassword() {
  const { user, loading } = useAccount();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function submit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const next = String(f.get("password"));
    if (next !== f.get("confirm")) {
      setMsg("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await changePassword({ data: { current: String(f.get("current")), next } });
      form.reset();
      setMsg("Password updated.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Password could not be updated.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <PublicLayout>
      <main className="mx-auto max-w-md px-5 py-16">
        <h1 className="text-3xl font-semibold">Change your password</h1>
        {loading ? null : user ? (
          <form className="mt-6 space-y-4" onSubmit={submit}>
            <label className="block text-sm">
              Current password
              <Input
                name="current"
                type="password"
                required
                autoComplete="current-password"
                className="mt-2"
              />
            </label>
            <label className="block text-sm">
              New password
              <Input
                name="password"
                type="password"
                required
                minLength={8}
                maxLength={72}
                autoComplete="new-password"
                className="mt-2"
              />
            </label>
            <label className="block text-sm">
              Confirm new password
              <Input
                name="confirm"
                type="password"
                required
                minLength={8}
                maxLength={72}
                autoComplete="new-password"
                className="mt-2"
              />
            </label>
            {msg && (
              <p role="status" className="text-sm text-primary">
                {msg}
              </p>
            )}
            <Button disabled={busy} className="w-full" type="submit">
              Update password
            </Button>
          </form>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">
            Please{" "}
            <Link to="/auth" className="text-primary">
              sign in
            </Link>{" "}
            to change your password.
          </p>
        )}
      </main>
    </PublicLayout>
  );
}
