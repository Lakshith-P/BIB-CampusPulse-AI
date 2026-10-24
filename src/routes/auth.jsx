import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  LifeBuoy,
  LoaderCircle,
  UserRound,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { pageHead } from "@/lib/metadata";
import { requestPasswordReset, setForgottenPassword, signIn } from "@/lib/auth.functions";
import { CaptchaField, useCaptcha } from "@/components/CaptchaField";
import { useAccount } from "@/lib/account";
import { LoginShowcase } from "@/components/auth/LoginShowcase";

export const Route = createFileRoute("/auth")({
  validateSearch: (search) => ({
    workspace: ["student", "faculty", "admin"].includes(search.workspace)
      ? search.workspace
      : undefined,
  }),
  head: () => pageHead("Log In", "Sign in to SLQG with student, teacher or administrator access."),
  component: Auth,
});

const WORKSPACES = [
  ["student", "Student"],
  ["faculty", "Teacher"],
  ["admin", "Administrator"],
];

// The server reports invalid input as a JSON list of problems; turn that into one sentence.
function friendly(err) {
  const text = err instanceof Error ? err.message : "";
  if (text.startsWith("[")) {
    try {
      const issues = JSON.parse(text);
      if (issues.some((i) => i.path?.[0]?.toString().startsWith("captcha")))
        return "Type the letters shown in the verification image first.";
      if (issues.some((i) => i.path?.[0] === "email")) return "Enter a valid email address.";
      if (issues.some((i) => i.path?.[0] === "password"))
        return "Passwords need 8 to 72 characters.";
    } catch {
      /* fall through */
    }
    return "Check the details you entered and try again.";
  }
  return text || "Sign-in failed. Please try again.";
}

const fieldBox =
  "h-[clamp(2.5rem,6vh,3.5rem)] w-full rounded-xl border-0 bg-muted px-5 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-primary placeholder:text-muted-foreground";

function Auth() {
  const [workspace, setWorkspace] = useState(Route.useSearch().workspace ?? "student");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState("login");
  const [sent, setSent] = useState("");
  // "Forgot password": null = asking, "pending" = waiting for the administrator,
  // "approved" = the person may choose the new password now
  const [forgot, setForgot] = useState({ state: null, email: "" });
  const navigate = useNavigate();
  const { user, refresh } = useAccount();
  const { captcha, reload: loadCaptcha } = useCaptcha(setError);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password") ?? "");
    const proof = {
      captchaToken: captcha?.token ?? "",
      captchaAnswer: String(form.get("captcha") ?? ""),
    };
    try {
      await signIn({ data: { email, password, workspace, ...proof } });
      await refresh();
      await navigate({ to: "/portal" });
    } catch (err) {
      setError(friendly(err));
      void loadCaptcha();
    } finally {
      setBusy(false);
    }
  }

  async function submitForgot(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(e.currentTarget);
    const proof = {
      captchaToken: captcha?.token ?? "",
      captchaAnswer: String(form.get("captcha") ?? ""),
    };
    try {
      if (forgot.state === "approved") {
        const password = String(form.get("password") ?? "");
        if (password !== form.get("confirm")) throw new Error("The two passwords do not match.");
        await setForgottenPassword({ data: { email: forgot.email, password, ...proof } });
        setSent("Your new password is saved. Log in with it now.");
        setForgot({ state: null, email: "" });
      } else {
        const email = String(form.get("email")).trim().toLowerCase();
        const { state } = await requestPasswordReset({ data: { email, ...proof } });
        setForgot({ state, email });
        void loadCaptcha(); // the next step needs a fresh one
      }
    } catch (err) {
      setError(friendly(err));
      void loadCaptcha();
    } finally {
      setBusy(false);
    }
  }

  const backToLogin = () => {
    setView("login");
    setForgot({ state: null, email: "" });
    setSent("");
    setError("");
    void loadCaptcha();
  };

  const captchaBox = <CaptchaField captcha={captcha} reload={loadCaptcha} />;

  return (
    <main
      data-role={workspace}
      className="grid min-h-dvh lg:h-dvh lg:grid-cols-2 lg:overflow-hidden"
    >
      <div className="hidden lg:block">
        <LoginShowcase
          workspace={workspace}
          onWorkspace={(next) => {
            setWorkspace(next);
            setError("");
          }}
        />
      </div>

      <section className="relative flex flex-col items-center justify-center gap-[clamp(0.35rem,1.8vh,1.25rem)] overflow-y-auto bg-background px-5 py-[clamp(0.5rem,2.5vh,2rem)]">
        <div className="absolute inset-x-5 top-3 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Back to website
          </Link>
          <ThemeToggle />
        </div>

        <div className="flex items-center gap-3">
          <img
            src="/slqg-logo.png"
            alt=""
            width="64"
            height="64"
            className="h-[clamp(2.4rem,7vh,4rem)] w-auto"
          />
          <div>
            <img
              src="/slqg-lettering.png"
              alt="SLQG"
              className="h-[clamp(1.4rem,4.5vh,2.4rem)] w-auto"
            />
            <p className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
              Student Learning, Quality &amp; Growth
            </p>
          </div>
        </div>

        <div className="w-full max-w-md rounded-3xl border bg-card p-5 shadow-sm sm:p-[clamp(0.75rem,3vh,2rem)]">
          {user ? (
            <div>
              <h1 className="font-display text-3xl font-semibold">You are signed in</h1>
              <p className="mt-2 text-sm text-muted-foreground">{user.email}</p>
              <Link
                to="/portal"
                className="mt-6 flex h-[clamp(2.5rem,6vh,3.5rem)] w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground"
              >
                Open my workspace <ArrowRight />
              </Link>
            </div>
          ) : view === "forgot" ? (
            <form onSubmit={submitForgot} className="space-y-[clamp(0.35rem,1.4vh,1rem)]">
              <h1 className="font-display text-2xl font-semibold">Forgot password</h1>
              {sent ? (
                <>
                  <p role="status" className="rounded-xl bg-muted/60 p-3 text-sm">
                    {sent}
                  </p>
                  <button
                    type="button"
                    onClick={backToLogin}
                    className="flex h-[clamp(2.5rem,6vh,3.5rem)] w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground"
                  >
                    Back to log in
                  </button>
                </>
              ) : forgot.state === "pending" ? (
                <>
                  <p role="status" className="rounded-xl bg-muted/60 p-3 text-sm">
                    Your request for <b>{forgot.email}</b> is waiting for the administrator to
                    approve it. Come back to this page later, enter your email again, and you can
                    set your new password.
                  </p>
                  <button
                    type="button"
                    onClick={backToLogin}
                    className="flex h-[clamp(2.5rem,6vh,3.5rem)] w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground"
                  >
                    Back to log in
                  </button>
                </>
              ) : forgot.state === "approved" ? (
                <>
                  <p role="status" className="rounded-xl bg-primary/10 p-3 text-sm text-primary">
                    The administrator approved your request. Choose a new password for{" "}
                    <b>{forgot.email}</b>.
                  </p>
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    maxLength={72}
                    autoComplete="new-password"
                    placeholder="New password (at least 8 characters)"
                    aria-label="New password"
                    className={fieldBox}
                  />
                  <input
                    name="confirm"
                    type="password"
                    required
                    minLength={8}
                    maxLength={72}
                    autoComplete="new-password"
                    placeholder="Confirm new password"
                    aria-label="Confirm new password"
                    className={fieldBox}
                  />
                  {captchaBox}
                  {error && (
                    <p
                      role="alert"
                      className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive"
                    >
                      {error}
                    </p>
                  )}
                  <button
                    disabled={busy || !captcha}
                    type="submit"
                    className="flex h-[clamp(2.5rem,6vh,3.5rem)] w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {busy && <LoaderCircle className="animate-spin" />}
                    Save new password
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Enter your college email. Your request goes to the administrator. Once it is
                    approved, come back here, enter your email again and set a new password.
                  </p>
                  <div className="relative">
                    <input
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="User ID (your college email)"
                      aria-label="User ID, your college email"
                      className={`${fieldBox} pr-14`}
                    />
                    <UserRound className="pointer-events-none absolute right-5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                  </div>
                  {captchaBox}
                  {error && (
                    <p
                      role="alert"
                      className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive"
                    >
                      {error}
                    </p>
                  )}
                  <button
                    disabled={busy || !captcha}
                    type="submit"
                    className="flex h-[clamp(2.5rem,6vh,3.5rem)] w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {busy && <LoaderCircle className="animate-spin" />}
                    Ask the administrator
                  </button>
                  <button
                    type="button"
                    onClick={backToLogin}
                    className="w-full text-center text-sm font-bold hover:text-primary"
                  >
                    Back to log in
                  </button>
                </>
              )}
            </form>
          ) : (
            <form onSubmit={submit} className="space-y-[clamp(0.35rem,1.4vh,1rem)]">
              <div className="flex flex-wrap items-center gap-4">
                <h1 className="font-display text-2xl font-semibold">Log in</h1>
                <label className="min-w-44 flex-1">
                  <span className="sr-only">Workspace</span>
                  <select
                    value={workspace}
                    onChange={(e) => {
                      setWorkspace(e.target.value);
                      setError("");
                    }}
                    className="h-[clamp(2.5rem,6vh,3.5rem)] w-full !rounded-xl !border-0 !bg-muted px-4 text-sm"
                  >
                    {WORKSPACES.map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="relative">
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="User ID (your college email)"
                  aria-label="User ID, your college email"
                  className={`${fieldBox} pr-14`}
                />
                <UserRound className="pointer-events-none absolute right-5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
              </div>
              <div className="relative">
                <input
                  name="password"
                  type={show ? "text" : "password"}
                  required
                  minLength={8}
                  maxLength={72}
                  autoComplete="current-password"
                  placeholder="Password"
                  aria-label="Password"
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

              {captchaBox}

              {error && (
                <p
                  role="alert"
                  className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive"
                >
                  {error}
                </p>
              )}
              <button
                disabled={busy || !captcha}
                type="submit"
                className="flex h-[clamp(2.5rem,6vh,3.5rem)] w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {busy && <LoaderCircle className="animate-spin" />}
                Login
              </button>

              <div className="relative space-y-1.5 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setView("forgot");
                    setSent("");
                    setError("");
                    void loadCaptcha();
                  }}
                  className="text-sm font-bold hover:text-primary"
                >
                  Forgot your password?
                </button>
                <p className="text-sm text-muted-foreground">
                  Accounts are created by your administrator, who emails you your login.
                </p>
              </div>
            </form>
          )}
        </div>

        <Link
          to="/contact"
          className="inline-flex items-center gap-2 text-sm text-foreground hover:text-primary"
        >
          <LifeBuoy className="size-5" /> Contact support
        </Link>
      </section>
    </main>
  );
}
