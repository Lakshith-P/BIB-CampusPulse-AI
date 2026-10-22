import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Megaphone, MessageSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CATEGORY,
  PostAnnouncement,
  AnnouncementsFeed,
  useAnnouncements,
} from "@/components/portal/Announcements";
import { listContactMessages } from "@/lib/campus.functions";
import { liveAssignments } from "@/lib/live-profile";
import { useCampus } from "@/lib/use-campus";

const fmt = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** Quick-link pills. `badge` is a count shown in a small red dot, `tone` picks the pill colour. */
function QuickLinkPills({ items }) {
  return (
    <div className="mb-6 flex flex-wrap gap-2.5">
      {items.map(([label, to, tone, badge]) => (
        <Link
          key={label}
          to={to}
          className={`relative rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${
            tone === "primary"
              ? "bg-primary text-primary-foreground hover:opacity-90"
              : "bg-info text-info-foreground hover:opacity-90"
          }`}
        >
          {label}
          {badge > 0 && (
            <span className="absolute -right-1.5 -top-2 flex min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold text-destructive-foreground">
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

/** A card with a pill-shaped tab on its top edge and a footer bar, like a notice board panel. */
function Panel({ icon: Icon, title, footer, action, children, className = "" }) {
  return (
    <section className={`surface relative flex flex-col pt-7 ${className}`}>
      <span className="absolute -top-4 left-5 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground shadow">
        <Icon className="size-4" /> {title}
      </span>
      <div className="min-h-64 flex-1 px-5 pb-4">{children}</div>
      <div className="flex items-center justify-between gap-3 border-t px-5 py-3 text-xs text-muted-foreground">
        <span>{footer}</span>
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
      <div className="flex h-full min-h-64 flex-col items-center justify-center rounded-xl bg-muted/50 p-6 text-center">
        <Sparkles className="mb-2 size-8 text-primary" />
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
      <div key={u.id} className="spotlight-slide relative overflow-hidden rounded-xl border">
        {u.image_url ? (
          <img
            src={u.image_url}
            alt={`${u.title} poster`}
            referrerPolicy="no-referrer"
            className="h-64 w-full bg-muted object-cover"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
        ) : (
          <div className="flex h-64 flex-col justify-end bg-gradient-to-br from-[var(--role-from)] via-[var(--role-via)] to-[var(--role-to)] p-6 text-white">
            <span className="mb-2 w-fit rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
              {c.label}
              {u.event_date ? ` · ${fmt(u.event_date)}` : ""}
            </span>
            <p className="font-display text-2xl font-bold leading-snug">
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
              className="absolute left-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Next"
              onClick={() => setI((i + 1) % slides.length)}
              className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
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
              className={`size-2.5 rounded-full ${n === i ? "bg-primary" : "bg-muted-foreground/40"}`}
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
        <li key={u.id} className="border-l-4 border-primary pl-3">
          <p className="text-xs text-muted-foreground">
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
  return (
    <>
      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold">Announcements</h2>
            <p className="text-sm text-muted-foreground">
              Placements, events, notices and posters from the university
            </p>
          </div>
          {role !== "student" && <PostAnnouncement />}
        </div>
        <AnnouncementsFeed limit={3} seeAll empty="Nothing has been posted yet." />
      </section>
      <QuickLinkPills items={links} />
      <div className="mb-8 mt-8 grid gap-8 lg:grid-cols-[1.5fr_1fr_1fr]">
        <Panel
          icon={Sparkles}
          title="Spotlight"
          footer="* Latest from your university"
          action={
            <Button asChild size="sm" variant="outline">
              <Link to="/portal/updates">All updates</Link>
            </Button>
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
