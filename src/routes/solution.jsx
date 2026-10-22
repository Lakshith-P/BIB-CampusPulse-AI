import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/PublicLayout";
import { pageHead } from "@/lib/metadata";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  CalendarCheck,
  MonitorPlay,
  Trophy,
  Code2,
  BriefcaseBusiness,
  MessageSquare,
  ArrowRight,
  CircleCheck,
} from "lucide-react";
export const Route = createFileRoute("/solution")({
  head: () =>
    pageHead(
      "Why BIB InsightIQ",
      "Seven connected campus data sources, explainable student success scores and timely mentor support.",
    ),
  component: Solution,
});
export const SOURCES = [
  { icon: BookOpen, name: "Academics", detail: "CGPA, SGPA, subject marks and backlogs" },
  {
    icon: CalendarCheck,
    name: "Attendance",
    detail: "Class counts, marks bands and recovery targets",
  },
  { icon: MonitorPlay, name: "LMS", detail: "Lessons, unit progress and assignments" },
  { icon: Trophy, name: "Engagement", detail: "Verified clubs, events and certifications" },
  { icon: Code2, name: "Skills", detail: "Coding, aptitude, verbal and communication" },
  { icon: BriefcaseBusiness, name: "Placement", detail: "Resume readiness and drive eligibility" },
  { icon: MessageSquare, name: "Feedback", detail: "Constructive feedback and mentor support" },
];
function Solution() {
  return (
    <PublicLayout>
      <main className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <p className="eyebrow">THE CAMPUS CHALLENGE</p>
        <h1 className="page-heading mt-4">
          One student. Seven systems.
          <br />
          One clearer picture.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          Good grades can hide poor attendance. Strong coding can hide an aptitude gap. Separate
          systems make it difficult to see who needs support before it is too late.
        </p>
        <div className="my-14 grid gap-10 border-y py-10 md:grid-cols-3">
          {[
            {
              t: "Who needs help?",
              d: "Prioritize students with transparent score bands, missing data and multiple risk signals.",
            },
            {
              t: "Why are they at risk?",
              d: "Trace each insight back to actual records, values and published thresholds.",
            },
            {
              t: "What should faculty do next?",
              d: "Create a practical intervention with an owner, follow-up date and progress status.",
            },
          ].map((x, i) => (
            <div key={x.t}>
              <span className="font-display text-sm text-primary">0{i + 1}</span>
              <h2 className="mt-3 text-2xl font-semibold">{x.t}</h2>
              <p className="mt-3 text-muted-foreground">{x.d}</p>
            </div>
          ))}
        </div>
        <p className="eyebrow">DATA THAT WORKS TOGETHER</p>
        <h2 className="mt-3 text-3xl font-semibold">Seven sources. A shared student ID.</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SOURCES.map((s) => (
            <div key={s.name} className="rounded-lg border bg-card p-6">
              <s.icon className="size-6 text-primary motion-icon" />
              <h3 className="mt-5 font-semibold">{s.name}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.detail}</p>
            </div>
          ))}
        </div>
        <div className="mt-16 grid gap-12 border-t pt-12 md:grid-cols-2">
          <div>
            <p className="eyebrow">EXPLAINABLE, NOT A BLACK BOX</p>
            <h2 className="mt-3 text-3xl font-semibold">
              A score starts a conversation.
              <br />
              It does not define a student.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Each source is normalized to 100. Available components are weighted transparently;
              missing data is disclosed, never silently counted as zero.
            </p>
            <Button asChild className="mt-6">
              <Link to="/auth">
                See your own score <ArrowRight />
              </Link>
            </Button>
          </div>
          <div className="space-y-4">
            {[
              ["Academics", 30],
              ["Attendance", 20],
              ["LMS", 15],
              ["Engagement", 10],
              ["Skills", 10],
              ["Placement readiness", 15],
            ].map(([name, w]) => (
              <div key={name} className="flex items-center justify-between border-b pb-3">
                <span className="flex items-center gap-3">
                  <CircleCheck className="size-4 text-primary" />
                  {name}
                </span>
                <span className="font-semibold">{w}%</span>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Default weights — not official university policy. Feedback is integrated for support,
              not a punitive score component.
            </p>
          </div>
        </div>
      </main>
    </PublicLayout>
  );
}
