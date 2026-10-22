import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, Eye, EyeOff, LoaderCircle, Orbit } from "lucide-react";
import { pageHead } from "@/lib/metadata";
import { resetPasswordWithToken } from "@/lib/auth.functions";

export const Route = createFileRoute("/new-password")({
  validateSearch: (search) => ({ token: typeof search.token === "string" ? search.token : "" }),
  head: () =>
    pageHead("Choose a new password", "Choose a new password for your BIB InsightIQ account."),
  component: NewPassword,
});

const fieldBox =
  "h-12 w-full rounded-xl border-0 bg-muted px-5 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-primary placeholder:text-muted-foreground";

function NewPassword() {
  const { token } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== form.get("confirm")) {
      setError("The two passwords do not match.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await resetPasswordWithToken({ data: { token, password } });
      setDone(true);
    } catch (err) {
      const text = err instanceof Error ? err.message : "";
      setError(
        text.startsWith("[")
          ? "Passwords need 8 to 72 characters."
          : text || "The password could not be changed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-5 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">
          <span className="brand-mark !size-12 !rounded-2xl">
            <Orbit className="size-7" />
          </span>
          <p className="font-display text-4xl font-bold text-primary">BIB InsightIQ</p>
        </div>
        <div className="rounded-3xl border bg-card p-7 shadow-sm">
          {done ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto size-12 text-success" />
              <h1 className="mt-3 font-display text-2xl font-semibold">Password changed</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                You can now log in with your new password.
              </p>
              <Link
                to="/auth"
                className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-primary font-semibold text-primary-foreground"
              >
                Go to log in
              </Link>
            </div>
          ) : !token ? (
            <div className="text-center">
              <h1 className="font-display text-2xl font-semibold">Link not valid</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                This page needs the link from your reset email. Request a new one from the login
                page.
              </p>
              <Link
                to="/auth"
                className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-primary font-semibold text-primary-foreground"
              >
                Back to log in
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <h1 className="font-display text-2xl font-semibold">Choose a new password</h1>
              <p className="text-sm text-muted-foreground">Use 8 to 72 characters.</p>
              <div className="relative">
                <input
                  name="password"
                  type={show ? "text" : "password"}
                  required
                  minLength={8}
                  maxLength={72}
                  autoComplete="new-password"
                  placeholder="New password"
                  aria-label="New password"
                  className={`${fieldBox} pr-14`}
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  aria-label={show ? "Hide password" : "Show password"}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </div>
              <input
                name="confirm"
                type={show ? "text" : "password"}
                required
                minLength={8}
                maxLength={72}
                autoComplete="new-password"
                placeholder="Confirm new password"
                aria-label="Confirm new password"
                className={fieldBox}
              />
              {error && (
                <p
                  role="alert"
                  className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive"
                >
                  {error}
                </p>
              )}
              <button
                disabled={busy}
                type="submit"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-60"
              >
                {busy && <LoaderCircle className="animate-spin" />} Change password
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
