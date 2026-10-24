import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Megaphone, MessageSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CATEGORY, useAnnouncements } from "@/components/portal/Announcements";
import { listContactMessages } from "@/lib/campus.functions";
import { liveAssignments } from "@/lib/live-profile";
import { useCampus } from "@/lib/use-campus";

const fmt = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/**
 * Quick links read as a line of ruled labels rather than a wall of filled pills. The primary
 * set is ink, the rest are hairline-ruled; `badge` is an unread count.
 */
function QuickLinkPills({ items }) {
  return (
    <nav aria-label="Quick links" className="mb-7 flex flex-wrap gap-2">
      {items.map(([label, to, tone, badge]) => (
        <Link
          key={label}
          to={to}
          className={`relative rounded-md px-3.5 py-2 text-sm font-semibold transition-colors ${
            tone === "primary"
              ? "bg-ink text-primary-foreground hover:bg-ink-strong"
              : "border border-rule bg-card text-foreground hover:border-ochre hover:bg-ochre-pale"
          }`}
        >
          {label}
          {badge > 0 && (
            <span className="absolute -right-1.5 -top-2 flex min-w-5 items-center justify-center rounded-full bg-risk-critical px-1 font-numeric text-[11px] font-bold tabular-nums text-destructive-foreground">
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}

/** A flat ruled panel: small-caps head on a hairline, content, then a quiet footer rule. */
function Panel({ icon: Icon, title, footer, action, children, className = "" }) {
  return (
    <section className={`surface flex flex-col ${className}`}>
      <h3 className="rule-head border-b border-rule px-5 py-3.5">
        <Icon className="size-3.5 shrink-0 text-ochre-ink" aria-hidden />
        <span className="shrink-0">{title}</span>
      </h3>
      <div className="min-h-56 flex-1 px-5 py-4">{children}</div>
      <div className="flex items-center justify-between gap-3 border-t border-rule px-5 py-3 text-xs text-label">
        <span className="min-w-0 truncate">{footer}</span>
        {action}
      </div>
    </section>
  );
}

/** The poster carousel. It advances by itself every six seconds, and pauses once anyone uses it. */
function Spotlight({ updates }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const slides = updates.slice(0, 5);
  useEffect(() => {
    if (paused || slides.length < 2) return;
    const timer = setInterval(() => setI((n) => (n + 1) % slides.length), 6000);
    return () => clearInterval(timer);
  }, [paused, slides.length]);
  if (slides.length === 0)
    return (
      <div className="flex h-full min-h-56 flex-col items-center justify-center rounded-md border border-dashed border-rule-strong bg-secondary/40 p-6 text-center">
        <Sparkles className="mb-2 size-7 text-ochre" />
        <p className="font-medium">Nothing in the spotlight yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Posters, drives and events posted by your university appear here.
        </p>
      </div>
    );
  const u = slides[Math.min(i, slides.length - 1)];
  const c = CATEGORY[u.category];
  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div
        key={u.id}
        className="spotlight-slide relative overflow-hidden rounded-md border border-rule"
      >
        {u.image_url ? (
          <img
            src={u.image_url}
            alt={`${u.title} poster`}
            referrerPolicy="no-referrer"
            className="h-56 w-full bg-muted object-cover"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
        ) : (
          <div className="flex h-56 flex-col justify-end bg-ink p-6 text-hero-foreground">
            <span className="mb-2.5 w-fit border-l-2 border-ochre pl-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-white/80">
              {c.label}
              {u.event_date ? ` · ${fmt(u.event_date)}` : ""}
            </span>
            <p className="font-display text-2xl font-semibold leading-snug tracking-[-0.02em]">
              {u.company ? `${u.company} · ` : ""}
              {u.title}
            </p>
            {u.body && <p className="mt-2 line-clamp-2 text-sm text-white/80">{u.body}</p>}
          </div>
        )}
        {slides.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous"
              onClick={() => setI((i - 1 + slides.length) % slides.length)}
              className="absolute left-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-ink/70 text-white transition-colors hover:bg-ink"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Next"
              onClick={() => setI((i + 1) % slides.length)}
              className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-ink/70 text-white transition-colors hover:bg-ink"
            >
              <ChevronRight className="size-4" />
            </button>
          </>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-medium">{u.title}</p>
        <div className="flex shrink-0 gap-1.5" role="tablist" aria-label="Slides">
          {slides.map((s, n) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={n === i}
              aria-label={`Slide ${n + 1}`}
              onClick={() => setI(n)}
              className={`size-2 rounded-full transition-colors ${n === i ? "bg-ochre" : "bg-rule-strong"}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Happening({ updates }) {
  if (updates.length === 0)
    return <p className="pt-4 text-sm text-muted-foreground">No campus updates yet.</p>;
  return (
    <ul className="space-y-4 pt-1">
      {updates.slice(0, 4).map((u) => (
        <li key={u.id} className="border-l-2 border-ochre pl-3">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-label">
            {CATEGORY[u.category].label} · {fmt(u.created_at)}
          </p>
          <p className="font-semibold leading-snug">
            {u.company ? `${u.company} · ` : ""}
            {u.title}
          </p>
        </li>
      ))}
    </ul>
  );
}

function Messages({ role, myRow, interventions, rows }) {
  const contact = useQuery({
    queryKey: ["contact-messages"],
    queryFn: () => listContactMessages(),
    enabled: role === "admin",
  });
  let items = [];
  if (role === "student" && myRow) {
    items = [...myRow.s.facultyFeedback]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((m) => ({ title: `From ${m.from}`, text: m.note, date: m.date }));
  } else if (role === "faculty") {
    const names = new Map(rows.map((r) => [r.id, r.name]));
    items = interventions
      .filter((x) => x.status !== "resolved")
      .sort((a, b) => a.follow_up_date.localeCompare(b.follow_up_date))
      .map((x) => ({
        title: `Follow up: ${names.get(x.student_id) ?? x.student_id}`,
        text: x.action,
        date: x.follow_up_date,
      }));
  } else if (role === "admin") {
    items = (contact.data ?? []).map((m) => ({
      title: `${m.name} wrote`,
      text: m.message,
      date: m.created_at.slice(0, 10),
    }));
  }
  const empty =
    role === "student"
      ? "No messages from your teachers yet."
      : role === "faculty"
        ? "No open follow-ups."
        : "No messages yet.";
  if (items.length === 0) return <p className="pt-4 text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-4 pt-1">
      {items.slice(0, 3).map((m, n) => (
        <li key={n} className="text-sm">
          <p className="font-semibold leading-snug">{m.title}</p>
          <p className="text-xs text-muted-foreground">{m.date}</p>
          <p className="mt-1 line-clamp-3 text-muted-foreground">{m.text}</p>
        </li>
      ))}
    </ul>
  );
}

/** Quick links plus the spotlight, happening and messages panels at the top of every overview. */
export function OverviewHub() {
  const { role, myRow, interventions, rows, today } = useCampus();
  const { data } = useAnnouncements();
  const updates = data ?? [];
  const placement = updates.filter((u) => u.category === "placement").length;
  const open = interventions.filter((i) => i.status !== "resolved").length;
  const pending = myRow ? liveAssignments(myRow.s, today).length : 0;
  const links = {
    student: [
      ["Results", "/portal/results", "primary"],
      ["Attendance", "/portal/attendance", "primary"],
      ["Placement", "/portal/placement", "primary", placement],
      ["Learning path", "/portal/learning", "info"],
      ["LMS", "/portal/lms", "info", pending],
      ["Skills", "/portal/skills", "info"],
      ["Feedback", "/portal/feedback", "info"],
      ["Announcements", "/portal/updates", "info", updates.length],
      ["Profile", "/portal/profile", "info"],
    ],
    faculty: [
      ["My students", "/portal/students", "primary"],
      ["Class results", "/portal/results", "primary"],
      ["Placement", "/portal/placement", "primary", placement],
      ["Support actions", "/portal/interventions", "info", open],
      ["Attendance & risk", "/portal/monitor", "info"],
      ["Post an announcement", "/portal/updates", "info"],
    ],
    admin: [
      ["All students", "/portal/students", "primary"],
      ["Results", "/portal/results", "primary"],
      ["Placement", "/portal/placement", "primary", placement],
      ["Assign students", "/portal/assign", "info"],
      ["Import CSV", "/portal/records", "info"],
      ["People & roles", "/portal/people", "info"],
      ["Messages", "/portal/messages", "info"],
      ["Audit log", "/portal/audit", "info"],
    ],
  }[role];
  const messageLink = {
    student: ["/portal/feedback", "All Messages", "Messages sent by teachers"],
    faculty: ["/portal/interventions", "All Follow-ups", "Your open follow-ups"],
    admin: ["/portal/messages", "All Messages", "Sent from the contact page"],
  }[role];
  // Students already have "Announcements" and "Feedback" as quick links with their own
  // unread badges, so Happening and My Messages would just repeat them — only Spotlight,
  // the one visually distinct panel, earns a place on a student's own overview. Faculty and
  // admin manage many students at once and have no such per-item badge, so they keep all three.
  if (role === "student")
    return (
      <>
        <QuickLinkPills items={links} />
        <Panel
          icon={Sparkles}
          title="Spotlight"
          footer="* Placements, events and notices from your university"
          action={
            <Button asChild size="sm" variant="outline">
              <Link to="/portal/updates">All updates</Link>
            </Button>
          }
          className="mb-6"
        >
          <Spotlight updates={updates} />
        </Panel>
      </>
    );
  return (
    <>
      <QuickLinkPills items={links} />
      <div className="mb-6 grid gap-5 lg:grid-cols-[1.5fr_1fr_1fr]">
        <Panel
          icon={Sparkles}
          title="Spotlight"
          footer="* Latest from your university"
          action={
            <div className="flex items-center gap-1.5">
              <Button asChild size="sm" variant="outline">
                <Link to="/portal/updates">All updates</Link>
              </Button>
            </div>
          }
        >
          <Spotlight updates={updates} />
        </Panel>
        <Panel
          icon={Megaphone}
          title="Happening"
          footer="* Happening on campus"
          action={
            <Button asChild size="sm">
              <Link to="/portal/updates">View More</Link>
            </Button>
          }
        >
          <Happening updates={updates} />
        </Panel>
        <Panel
          icon={MessageSquare}
          title="My Messages"
          footer={`* ${messageLink[2]}`}
          action={
            <Button asChild size="sm">
              <Link to={messageLink[0]}>{messageLink[1]}</Link>
            </Button>
          }
        >
          <Messages role={role} myRow={myRow} interventions={interventions} rows={rows} />
        </Panel>
      </div>
    </>
  );
}
