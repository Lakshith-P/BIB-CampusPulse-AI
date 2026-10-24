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
  Eye,
  ShieldCheck,
} from "lucide-react";
import { DEFAULT_WEIGHTS } from "@/lib/types";
import { SOURCES } from "./solution";
// One editorial scale for every section head, so the serif is used with optical restraint.
const sectionHeading =
  "font-display text-[2rem] font-semibold leading-[1.12] tracking-[-0.025em] sm:text-[2.5rem]";
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
        <section className="paper-grain relative overflow-hidden border-b border-rule">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 lg:grid-cols-2 lg:px-8 lg:py-24">
            <div>
              <p className="eyebrow">BIB InsightIQ · Student success intelligence</p>
              <h1 className="hero-heading mt-6 text-foreground">
                Turn campus data into{" "}
                <em className="relative not-italic">
                  student success.
                  <span
                    aria-hidden
                    className="absolute inset-x-0 -bottom-1 h-[3px] bg-ochre sm:-bottom-2"
                  />
                </em>
              </h1>
              <p className="mt-8 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
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
              <p className="mt-7 flex items-center gap-2 border-t border-rule pt-5 text-xs text-muted-foreground">
                <ShieldCheck className="size-4 text-ochre-ink" />
                Explainable insights. Human-led support. Private by design.
              </p>
            </div>
            <figure
              aria-label="Illustrative preview of the Student Success Score"
              className="relative"
            >
              <div className="surface relative z-10 bg-card p-6 sm:p-7">
                <p className="stat-label">
                  <span>Success Score</span>
                </p>
                <div className="stat-figure-row">
                  <span className="stat-figure !text-[clamp(3.25rem,2rem+6vw,4.5rem)]">74</span>
                  <span className="font-numeric text-lg font-medium text-label">/ 100</span>
                  <span className="ml-auto inline-flex items-center gap-1.5 self-center rounded-full bg-risk-monitor-pale px-2.5 py-0.5 text-xs font-semibold text-risk-monitor">
                    <Eye className="size-3" aria-hidden /> Monitor
                  </span>
                </div>
                <dl className="mt-6 divide-y divide-rule">
                  {[
                    ["Academics", 82],
                    ["Attendance", 71],
                    ["LMS", 64],
                    ["Placement readiness", 58],
                  ].map(([k, v]) => (
                    <div
                      key={k}
                      className="grid grid-cols-[1fr_auto_5rem] items-center gap-3 py-2.5"
                    >
                      <dt className="text-sm text-foreground">{k}</dt>
                      <dd className="font-numeric text-sm font-semibold tabular-nums">{v}</dd>
                      <div aria-hidden className="h-1.5 bg-secondary">
                        <div className="h-full bg-ink" style={{ width: `${v}%` }} />
                      </div>
                    </div>
                  ))}
                </dl>
                <p className="mt-5 border-l-2 border-ochre bg-ochre-pale px-3 py-2.5 text-xs leading-relaxed text-accent-foreground">
                  <b className="font-semibold">Why flagged:</b> attendance under 75% in 1 subject,
                  placement readiness below 60%.
                </p>
              </div>
              <figcaption className="relative z-10 mt-3 text-xs text-label">
                Illustrative preview, not a live student record.
              </figcaption>
            </figure>
          </div>
        </section>
        <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8" aria-labelledby="problem">
          <p className="eyebrow">THE CAMPUS PROBLEM</p>
          <h2 id="problem" className={`mt-4 max-w-3xl ${sectionHeading}`}>
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
              <h2 id="solution" className={`mt-4 ${sectionHeading}`}>
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
          <h2 id="domains" className={`mt-4 ${sectionHeading}`}>
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
              <h2 id="score" className={`mt-4 ${sectionHeading}`}>
                A score that starts a conversation
              </h2>
              <p className="mt-4 text-muted-foreground">
                Six components, each normalised to 100 and combined with published weights. Select
                any component on a student page to see the numbers behind it. Missing data is shown
                as missing and is never counted as zero. The score is rule-based, not an AI
                prediction.
              </p>
              <ul className="mt-6 divide-y divide-rule border-y border-rule text-sm">
                {[
                  ["80+", "On Track", "text-risk-track"],
                  ["65–79", "Monitor", "text-risk-monitor"],
                  ["50–64", "Needs Attention", "text-risk-attention"],
                  ["Below 50", "High Priority", "text-risk-critical"],
                ].map(([range, name, tone]) => (
                  <li key={name} className="flex items-baseline justify-between gap-4 py-2.5">
                    <span className="font-numeric font-semibold tabular-nums">{range}</span>
                    <span className={`font-semibold ${tone}`}>{name}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="surface p-6">
              <p className="rule-head">Default weights</p>
              <div className="mt-4 divide-y divide-rule">
                {Object.entries(DEFAULT_WEIGHTS).map(([k, w]) => (
                  <div
                    key={k}
                    className="grid grid-cols-[1fr_auto_6rem] items-center gap-3 py-2.5 text-sm"
                  >
                    <span className="capitalize">
                      {k === "placement" ? "placement readiness" : k}
                    </span>
                    <span className="font-numeric font-semibold tabular-nums">{w}%</span>
                    <div aria-hidden className="h-1.5 bg-secondary">
                      <div className="h-full bg-ochre" style={{ width: `${w * 3}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Academic risk and placement risk are two separate flags with their own rules.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8" aria-labelledby="risk">
          <p className="eyebrow">EARLY RISK IDENTIFICATION AND INTERVENTION</p>
          <h2 id="risk" className={`mt-4 ${sectionHeading}`}>
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
              <li key={t} className="border-t-2 border-ink pt-3.5">
                <span className="font-display text-3xl font-semibold tabular-nums text-ochre-ink">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-2 font-semibold">{t}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-y bg-card" aria-labelledby="workspaces">
          <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
            <p className="eyebrow">THREE WORKSPACES</p>
            <h2 id="workspaces" className={`mt-4 ${sectionHeading}`}>
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
              <h2 id="privacy" className={`mt-4 ${sectionHeading}`}>
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
              <h2 id="cta" className={sectionHeading}>
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
