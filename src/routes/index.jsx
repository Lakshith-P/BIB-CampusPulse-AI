import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/PublicLayout";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/metadata";
import {
  ArrowRight,
  ArrowUpRight,
  Users,
  ScanLine,
  ClipboardCheck,
  ShieldCheck,
} from "lucide-react";
import { DEFAULT_WEIGHTS } from "@/lib/types";
import { SOURCES } from "./solution";
export const Route = createFileRoute("/")({
  head: () =>
    pageHead(
      "Student Success Intelligence Platform",
      "Turning campus data into student success. Discover seven connected data sources, explainable risk insights and timely mentor support with BIB InsightIQ.",
    ),
  component: Home,
});
function Home() {
  return (
    <PublicLayout>
      <main>
        <section className="relative overflow-hidden border-b bg-[radial-gradient(60rem_28rem_at_85%_-10%,var(--rose-pale),transparent)]">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 lg:grid-cols-2 lg:px-8 lg:py-24">
            <div>
              <p className="eyebrow flex items-center gap-2">
                <span className="size-2 rounded-full bg-primary" />
                BIB INSIGHTIQ · STUDENT SUCCESS INTELLIGENCE
              </p>
              <h1 className="mt-5 font-display text-4xl font-extrabold leading-[1.1] text-foreground sm:text-5xl lg:text-6xl">
                Turn Campus Data Into <span className="text-primary">Student Success.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Seven connected student data sources become one explainable Success Score, clear
                risk reasons and a practical next step for every student, so mentors can act before
                a small gap becomes a bigger challenge.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link to="/auth">
                    Get Started / Login <ArrowRight />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/solution">
                    Explore Platform <ArrowUpRight />
                  </Link>
                </Button>
              </div>
              <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="size-4 text-primary" />
                Explainable insights. Human-led support. Private by design.
              </p>
            </div>
            <figure
              aria-label="Illustrative preview of the Student Success Score"
              className="relative"
            >
              <div className="surface relative z-10 p-5 shadow-lg">
                <div className="flex items-center gap-5">
                  <svg viewBox="0 0 100 100" className="size-24 shrink-0 -rotate-90" aria-hidden>
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke="var(--border)"
                      strokeWidth="9"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke="var(--primary)"
                      strokeWidth="9"
                      strokeLinecap="round"
                      strokeDasharray="264"
                      strokeDashoffset="68"
                    />
                  </svg>
                  <div>
                    <p className="text-xs font-semibold uppercase text-label">Success Score</p>
                    <p className="font-display text-4xl font-bold tabular-nums">74 / 100</p>
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning">
                      Monitor
                    </span>
                  </div>
                </div>
                <div className="mt-5 space-y-3">
                  {[
                    ["Academics", 82],
                    ["Attendance", 71],
                    ["LMS", 64],
                    ["Placement", 58],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <div className="flex justify-between text-xs">
                        <span>{k}</span>
                        <span className="tabular-nums text-muted-foreground">{v}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${v}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-4 rounded-lg bg-accent p-3 text-xs text-accent-foreground">
                  Why flagged: attendance under 75% in 1 subject, placement readiness below 60%.
                </p>
              </div>
              <div
                aria-hidden
                className="absolute -bottom-4 -right-3 h-full w-full rounded-[14px] border bg-rose-pale"
              />
              <figcaption className="relative z-10 mt-3 text-xs text-muted-foreground">
                Illustrative preview, not a live student record.
              </figcaption>
            </figure>
          </div>
        </section>
        <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8" aria-labelledby="problem">
          <p className="eyebrow">THE CAMPUS PROBLEM</p>
          <h2 id="problem" className="mt-3 max-w-3xl font-display text-3xl font-bold sm:text-4xl">
            One student. Seven systems. Nobody sees the whole picture.
          </h2>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Good grades can hide poor attendance. Strong coding can hide an aptitude gap. When
            marks, attendance, the LMS, activities, skills, placement and feedback live in separate
            places, the students who need help are found late.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-hidden>
            {SOURCES.map((s) => (
              <div
                key={s.name}
                className="flex items-center gap-3 rounded-xl border border-dashed bg-card/60 p-4"
              >
                <s.icon className="size-5 text-label" />
                <span className="text-sm text-muted-foreground">{s.name} system</span>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y bg-card" aria-labelledby="solution">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-16 lg:grid-cols-2 lg:px-8">
            <div>
              <p className="eyebrow">THE SOLUTION</p>
              <h2 id="solution" className="mt-3 font-display text-3xl font-bold sm:text-4xl">
                A unified student intelligence platform
              </h2>
              <p className="mt-4 text-muted-foreground">
                BIB InsightIQ joins the seven sources on one student identity and answers three
                questions for every student: who needs help, why, and what to do next.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  [
                    Users,
                    "Who needs help?",
                    "Students ranked by transparent score bands and risk flags.",
                  ],
                  [
                    ScanLine,
                    "Why are they at risk?",
                    "Every flag lists the exact rule, value and threshold behind it.",
                  ],
                  [
                    ClipboardCheck,
                    "What should happen next?",
                    "Interventions with an owner, a follow-up date and visible progress.",
                  ],
                ].map(([Icon, q, d]) => (
                  <li key={q} className="flex gap-3">
                    <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
                    <span>
                      <b>{q}</b>
                      <span className="block text-sm text-muted-foreground">{d}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="surface p-5" aria-label="Seven data domains">
              <div className="flex items-center justify-center rounded-xl bg-accent p-4">
                <span className="brand-mark" aria-hidden>
                  <ScanLine className="size-6" />
                </span>
                <span className="ml-3 font-display font-bold">One student ID</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {SOURCES.map((s) => (
                  <div
                    key={s.name}
                    className="flex items-center gap-2 rounded-lg border p-2 text-sm"
                  >
                    <s.icon className="size-4 text-primary" />
                    {s.name}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8" aria-labelledby="domains">
          <p className="eyebrow">SEVEN CONNECTED DATA DOMAINS</p>
          <h2 id="domains" className="mt-3 font-display text-3xl font-bold sm:text-4xl">
            Each domain has its own page, filters and rules
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SOURCES.map((s) => (
              <article
                key={s.name}
                className="surface p-5 transition-colors hover:border-[var(--border-hover)]"
              >
                <s.icon className="size-6 text-primary" />
                <h3 className="mt-4 font-semibold">{s.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y bg-card" aria-labelledby="score">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 lg:grid-cols-2 lg:px-8">
            <div>
              <p className="eyebrow">EXPLAINABLE STUDENT SUCCESS SCORE</p>
              <h2 id="score" className="mt-3 font-display text-3xl font-bold sm:text-4xl">
                A score that starts a conversation
              </h2>
              <p className="mt-4 text-muted-foreground">
                Six components, each normalised to 100 and combined with published weights. Select
                any component on a student page to see the numbers behind it. Missing data is shown
                as missing and is never counted as zero. The score is rule-based, not an AI
                prediction.
              </p>
              <ul className="mt-5 grid grid-cols-2 gap-2 text-sm">
                {[
                  ["80+", "On Track"],
                  ["65–79", "Monitor"],
                  ["50–64", "Needs Attention"],
                  ["Below 50", "High Priority"],
                ].map(([range, name]) => (
                  <li key={name} className="rounded-lg border p-2">
                    <b className="tabular-nums">{range}</b> · {name}
                  </li>
                ))}
              </ul>
            </div>
            <div className="surface space-y-3 p-5">
              <p className="text-xs font-semibold uppercase text-label">Default weights</p>
              {Object.entries(DEFAULT_WEIGHTS).map(([k, w]) => (
                <div key={k}>
                  <div className="flex justify-between text-sm">
                    <span className="capitalize">
                      {k === "placement" ? "placement readiness" : k}
                    </span>
                    <span className="tabular-nums">{w}%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${w * 3}%` }}
                    />
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Academic risk and placement risk are two separate flags with their own rules.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8" aria-labelledby="risk">
          <p className="eyebrow">EARLY RISK IDENTIFICATION AND INTERVENTION</p>
          <h2 id="risk" className="mt-3 font-display text-3xl font-bold sm:text-4xl">
            From signal to support, with a record of what happened
          </h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-5">
            {[
              [
                "Detect",
                "Rules flag low attendance, backlogs, missed deadlines and weak readiness.",
              ],
              ["Explain", "The student page lists the rules that fired and their values."],
              ["Act", "A mentor creates an intervention with an owner and a date."],
              ["Follow up", "Overdue follow-ups raise notifications."],
              ["Review", "Outcomes are recorded so progress is visible."],
            ].map(([t, d], i) => (
              <li key={t} className="surface p-4">
                <span className="font-display text-2xl font-bold tabular-nums text-primary">
                  {i + 1}
                </span>
                <h3 className="mt-1 font-semibold">{t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-y bg-card" aria-labelledby="workspaces">
          <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
            <p className="eyebrow">THREE WORKSPACES</p>
            <h2 id="workspaces" className="mt-3 font-display text-3xl font-bold sm:text-4xl">
              The right view for each person
            </h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                [
                  "Student",
                  "Your score, attendance planner, LMS units and assignments, placement drives with eligibility checklists, skills history and a confidential feedback centre.",
                ],
                [
                  "Faculty and mentors",
                  "Assigned students ranked by need, comparison, declining-performance alerts, grading, drive and opportunity management, and intervention tracking.",
                ],
                [
                  "Administrators",
                  "Campus analytics with filters, data-quality alerts, roles and assignments, CSV import, complaints review and an audit log.",
                ],
              ].map(([t, d]) => (
                <article key={t} className="surface p-5">
                  <h3 className="font-display text-lg font-semibold">{t}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{d}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8" aria-labelledby="privacy">
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <p className="eyebrow">PRIVACY, PERMISSIONS AND RESPONSIBLE ANALYTICS</p>
              <h2 id="privacy" className="mt-3 font-display text-3xl font-bold sm:text-4xl">
                Private by design, advisory by intent
              </h2>
            </div>
            <ul className="space-y-3 text-sm">
              {[
                "Roles are stored in the database and re-checked on every request. Choosing a role at sign-in grants nothing.",
                "Students see their own records. Teachers see students assigned to them. Administrators are granted separately.",
                "Confidential complaints are readable only by the student and administrators, and notifications never contain their text.",
                "Scores and flags are advisory. They point a person to a conversation; they do not decide outcomes.",
                "Passwords are hashed and sessions can be ended server-side.",
              ].map((x) => (
                <li key={x} className="flex gap-3">
                  <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
                  {x}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t bg-accent/50" aria-labelledby="cta">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-8 px-5 py-14 lg:px-8">
            <div>
              <h2 id="cta" className="font-display text-3xl font-bold">
                See your campus through BIB InsightIQ.
              </h2>
              <p className="mt-2 text-muted-foreground">
                Sign in to your workspace, or get in touch with the team.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/auth">
                  Get Started / Login <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/contact">Contact us</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}
