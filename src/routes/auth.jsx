import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LifeBuoy,
  LoaderCircle,
  Orbit,
  UserRound,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { pageHead } from "@/lib/metadata";
import { requestPasswordReset, signIn, signUp } from "@/lib/auth.functions";
import { CaptchaField, useCaptcha } from "@/components/CaptchaField";
import { useAccount } from "@/lib/account";
import { LANDING, landingFor } from "@/lib/destinations";
import campus from "@/assets/campus.jpg";

export const Route = createFileRoute("/auth")({
  validateSearch: (search) => ({
    workspace: ["student", "faculty", "admin"].includes(search.workspace)
      ? search.workspace
      : undefined,
  }),
  head: () =>
    pageHead("Log In", "Sign in to BIB InsightIQ with student, teacher or administrator access."),
  component: Auth,
});

const WORKSPACES = [
  ["student", "Student"],
  ["faculty", "Teacher"],
  ["admin", "Administrator"],
];

// The left side cycles through a few messages, like a notice board. Manual only: no auto-motion.
const SLIDES = [
  {
    title: "BIB InsightIQ sets a new standard for student success",
    sub: "One score. Seven data sources. A clear next step for every student.",
    big: "07",
    bigLabel: "connected data sources",
    points: [],
  },
  {
    title: "Know who needs help, and why",
    sub: "Every student's story in one place, for the people who support them.",
    points: [
      "Students: your score, attendance, results and placement readiness",
      "Teachers: your students ranked by need, with follow-ups",
      "Administrators: campus-wide analytics and records",
    ],
  },
  {
    title: "Private by design",
    sub: "Your records are only shown to the people allowed to see them.",
    points: [
      "Passwords are hashed and sessions are signed",
      "Permissions are checked on the server for every request",
      "Human review always, scores are a decision aid",
    ],
  },
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
  const [mode, setMode] = useState("login");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [slide, setSlide] = useState(0);
  const [view, setView] = useState("login");
  const [sent, setSent] = useState("");
  const navigate = useNavigate();
  const { user, refresh } = useAccount();
  const { captcha, reload: loadCaptcha } = useCaptcha(setError);
  const [landing, setLanding] = useState("/portal");
  // Remember the last choice for each workspace in this browser.
  useEffect(() => {
    try {
      setLanding(landingFor(workspace, localStorage.getItem(`orbit-landing-${workspace}`)));
    } catch {
      setLanding("/portal");
    }
  }, [workspace]);
  const signingUp = mode === "signup";
  const s = SLIDES[slide];

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
      if (signingUp) {
        const created = await signUp({
          data: { email, password, name: String(form.get("name") ?? ""), workspace, ...proof },
        });
        if (created.status === "pending") {
          setSent(
            "Your teacher access request has been sent. An administrator has to approve it first, and they have been notified. You can log in to the Teacher workspace once it is approved.",
          );
          setView("notice");
          return;
        }
      } else {
        await signIn({ data: { email, password, workspace, ...proof } });
      }
      await refresh();
      try {
        localStorage.setItem(`orbit-landing-${workspace}`, landing);
      } catch {
        /* the choice just is not remembered */
      }
      await navigate({ to: landingFor(workspace, landing) });
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
    const email = String(form.get("email"));
    try {
      const { delivery } = await requestPasswordReset({
        data: {
          email,
          captchaToken: captcha?.token ?? "",
          captchaAnswer: String(form.get("captcha") ?? ""),
        },
      });
      setSent(
        delivery === "email"
          ? `If an account exists for ${email}, we have sent a link to choose a new password. It works once and expires in 30 minutes.`
          : "Email is not set up on this server yet, so your request has been sent to the administrators. They will give you a temporary password; change it after logging in.",
      );
    } catch (err) {
      setError(friendly(err));
      void loadCaptcha();
    } finally {
      setBusy(false);
    }
  }

  const backToLogin = () => {
    setView("login");
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
      <section
        className="relative hidden overflow-hidden bg-black lg:block"
        aria-label="BIB InsightIQ"
      >
        <img src={campus} alt="" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-black/25" />
        <div
          className="absolute inset-0 bg-gradient-to-br from-[var(--role-from)] via-[var(--role-via)] to-[var(--role-to)] opacity-95 [clip-path:polygon(0_12%,66%_12%,52%_86%,0_86%)]"
          aria-hidden
        />
        <div className="absolute left-[8%] top-[18%] w-[48%] text-white" aria-live="polite">
          <h2 className="font-display text-[clamp(1.5rem,4.2vh,2.5rem)] font-bold leading-tight">
            {s.title}
          </h2>
          <p className="mt-3 text-white/85">{s.sub}</p>
          {s.big && (
            <div className="mt-8">
              <p className="font-display text-[clamp(3.5rem,11vh,6rem)] font-bold leading-none">
                {s.big}
              </p>
              <p className="mt-2 text-lg font-semibold uppercase tracking-wide text-white/90">
                {s.bigLabel}
              </p>
            </div>
          )}
          {s.points.length > 0 && (
            <ul className="mt-8 space-y-4 text-sm">
              {s.points.map((p) => (
                <li key={p} className="flex gap-2.5">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-white/80" />
                  {p}
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="absolute bottom-[6%] left-[8%] max-w-md text-xs text-white/80">
          Turning campus data into student success.
        </p>
        <div className="absolute right-6 top-6 flex gap-2" role="tablist" aria-label="Slides">
          {SLIDES.map((_, n) => (
            <button
              key={n}
              type="button"
              role="tab"
              aria-selected={n === slide}
              aria-label={`Slide ${n + 1}`}
              onClick={() => setSlide(n)}
              className={`size-3 rounded-full ${n === slide ? "bg-primary" : "bg-white/50"}`}
            />
          ))}
        </div>
      </section>

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

        <div className="flex items-center gap-4">
          <span className="brand-mark !size-[clamp(2.1rem,7vh,4rem)] !rounded-2xl">
            <Orbit className="size-6 sm:size-7" />
          </span>
          <div>
            <p className="font-display text-[clamp(1.6rem,6vh,3rem)] font-bold leading-none text-primary">
              BIB InsightIQ
            </p>
            <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.35em] text-muted-foreground">
              Student success platform
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
          ) : view === "notice" ? (
            <div className="space-y-[clamp(0.5rem,2vh,1rem)]">
              <h1 className="font-display text-2xl font-semibold">Request sent</h1>
              <p className="rounded-xl bg-muted/60 p-3 text-sm">{sent}</p>
              <button
                type="button"
                onClick={() => {
                  setView("login");
                  setMode("login");
                  setSent("");
                  void loadCaptcha();
                }}
                className="flex h-[clamp(2.5rem,6vh,3.5rem)] w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground"
              >
                Back to log in
              </button>
            </div>
          ) : view === "forgot" ? (
            <form onSubmit={submitForgot} className="space-y-[clamp(0.35rem,1.4vh,1rem)]">
              <h1 className="font-display text-2xl font-semibold">Reset password</h1>
              {sent ? (
                <>
                  <p className="rounded-xl bg-muted/60 p-3 text-sm">{sent}</p>
                  <button
                    type="button"
                    onClick={backToLogin}
                    className="flex h-[clamp(2.5rem,6vh,3.5rem)] w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground"
                  >
                    Back to log in
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Enter your college email and we will help you choose a new password.
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
                    Send reset link
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
                <h1 className="font-display text-2xl font-semibold">
                  {signingUp ? "Sign up" : "Log in"}
                </h1>
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

              {signingUp && (
                <input
                  name="name"
                  required
                  maxLength={100}
                  autoComplete="name"
                  placeholder="Full name"
                  aria-label="Full name"
                  className={fieldBox}
                />
              )}
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
                  autoComplete={signingUp ? "new-password" : "current-password"}
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

              <label className="flex items-center gap-3 text-sm font-medium">
                <span className="shrink-0">Open after login</span>
                <select
                  value={landing}
                  onChange={(e) => setLanding(e.target.value)}
                  className="h-[clamp(2.5rem,6vh,3.5rem)] min-w-0 flex-1 !rounded-xl !border-0 !bg-muted px-4 text-sm"
                >
                  {LANDING[workspace].map((o) => (
                    <option key={o.to} value={o.to}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

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
                {signingUp ? "Create account" : "Login"}
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
                  {signingUp ? "Already registered?" : "New here?"}{" "}
                  <button
                    type="button"
                    className="font-semibold text-primary hover:underline"
                    onClick={() => {
                      setMode(signingUp ? "login" : "signup");
                      setError("");
                    }}
                  >
                    {signingUp ? "Log in" : "Create an account"}
                  </button>
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
