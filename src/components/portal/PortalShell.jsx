import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Bell,
  Award,
  BookOpen,
  Brain,
  Briefcase,
  CalendarCheck,
  ClipboardList,
  FolderOpen,
  LayoutDashboard,
  Link2,
  LogOut,
  Mail,
  MessageSquare,
  Route as RouteIcon,
  ScrollText,
  ShieldAlert,
  Megaphone,
  Trophy,
  UserCheck,
  UserRound,
  Users,
  KeyRound,
  Menu,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Brand } from "@/components/PublicLayout";
import { GlobalSearch } from "@/components/portal/GlobalSearch";
import { NotificationBell } from "@/components/portal/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CATEGORY, useAnnouncements } from "@/components/portal/Announcements";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MENUS, RAIL } from "@/lib/destinations";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth.functions";
import { useAccount } from "@/lib/account";
import { useCampus } from "@/lib/use-campus";

// What each kind of person needs is different, so each gets its own menu.
export const NAV = {
  student: [
    { to: "/portal", label: "Overview", icon: LayoutDashboard, exact: true },
    { to: "/portal/notifications", label: "Notifications", icon: Bell },
    { to: "/portal/updates", label: "Announcements", icon: Megaphone },
    { to: "/portal/profile", label: "Profile", icon: UserRound },
    { to: "/portal/results", label: "Results", icon: Award },
    { to: "/portal/learning", label: "Learning path", icon: RouteIcon },
    { to: "/portal/attendance", label: "Attendance", icon: CalendarCheck },
    { to: "/portal/lms", label: "LMS", icon: BookOpen },
    { to: "/portal/skills", label: "Skills", icon: Brain },
    { to: "/portal/placement", label: "Placement", icon: Briefcase },
    { to: "/portal/engagement", label: "Engagement", icon: Trophy },
    { to: "/portal/feedback", label: "Feedback", icon: MessageSquare },
  ],
  faculty: [
    { to: "/portal", label: "Overview", icon: LayoutDashboard, exact: true },
    { to: "/portal/notifications", label: "Notifications", icon: Bell },
    { to: "/portal/updates", label: "Announcements", icon: Megaphone },
    { to: "/portal/students", label: "My students", icon: Users },
    { to: "/portal/results", label: "Results", icon: Award },
    { to: "/portal/placement", label: "Placement", icon: Briefcase },
    { to: "/portal/attendance", label: "Attendance", icon: CalendarCheck },
    { to: "/portal/lms", label: "LMS", icon: BookOpen },
    { to: "/portal/engagement", label: "Engagement", icon: Trophy },
    { to: "/portal/skills", label: "Skills", icon: Brain },
    { to: "/portal/feedback", label: "Feedback", icon: MessageSquare },
    { to: "/portal/interventions", label: "Interventions", icon: ClipboardList },
    { to: "/portal/monitor", label: "Attendance & risk", icon: Activity },
    { to: "/portal/profile", label: "Profile", icon: UserRound },
  ],
  admin: [
    { to: "/portal", label: "Overview", icon: LayoutDashboard, exact: true },
    { to: "/portal/notifications", label: "Notifications", icon: Bell },
    { to: "/portal/updates", label: "Announcements", icon: Megaphone },
    { to: "/portal/students", label: "All students", icon: Users },
    { to: "/portal/results", label: "Results", icon: Award },
    { to: "/portal/placement", label: "Placement", icon: Briefcase },
    { to: "/portal/attendance", label: "Attendance", icon: CalendarCheck },
    { to: "/portal/lms", label: "LMS", icon: BookOpen },
    { to: "/portal/engagement", label: "Engagement", icon: Trophy },
    { to: "/portal/skills", label: "Skills", icon: Brain },
    { to: "/portal/feedback", label: "Feedback", icon: MessageSquare },
    { to: "/portal/teachers", label: "Teachers", icon: UserCheck },
    { to: "/portal/assign", label: "Assign students", icon: Link2 },
    { to: "/portal/people", label: "People & roles", icon: KeyRound },
    { to: "/portal/records", label: "Student records", icon: FolderOpen },
    { to: "/portal/interventions", label: "Interventions", icon: ClipboardList },
    { to: "/portal/monitor", label: "Attendance & risk", icon: Activity },
    { to: "/portal/messages", label: "Messages", icon: Mail },
    { to: "/portal/complaints", label: "Complaints", icon: ShieldAlert },
    { to: "/portal/audit", label: "Audit log", icon: ScrollText },
    { to: "/portal/profile", label: "Profile", icon: UserRound },
  ],
};
const ROLE_LABEL = { student: "Student", faculty: "Teacher", admin: "Administrator" };
const RAIL_ICON = {
  dashboard: LayoutDashboard,
  academic: Award,
  lms: BookOpen,
  engagement: Trophy,
  skills: Brain,
  feedback: MessageSquare,
  results: Award,
  attendance: CalendarCheck,
  learning: BookOpen,
  placement: Briefcase,
  updates: Megaphone,
  profile: UserRound,
  students: Users,
  support: ClipboardList,
  people: KeyRound,
};

function initials(name) {
  return (
    name
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("") || "?"
  );
}

/** A thin bar across the top of the screen while a page or its data is loading. */
function LoadingBar() {
  const busy = useRouterState({ select: (s) => s.isLoading || s.isTransitioning });
  return (
    <div
      aria-hidden
      className={`fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden transition-opacity ${busy ? "opacity-100" : "opacity-0"}`}
    >
      <div className="portal-loading-bar h-full w-1/3 bg-ochre" />
    </div>
  );
}

/**
 * The latest announcements as a slim strip across the very top of the workspace. It moves on by
 * itself every few seconds so each one is seen without anybody clicking.
 */
function AnnouncementStrip() {
  const { data } = useAnnouncements();
  const [hidden, setHidden] = useState(false);
  const [i, setI] = useState(0);
  const items = (data ?? []).slice(0, 5);
  useEffect(() => {
    if (items.length < 2) return;
    const timer = setInterval(() => setI((n) => (n + 1) % items.length), 6000);
    return () => clearInterval(timer);
  }, [items.length]);
  if (!items.length || hidden) return null;
  const latest = items[i % items.length];
  return (
    <div className="flex items-center gap-3 border-b border-ochre/35 bg-ochre-pale px-4 py-2 text-sm print:hidden">
      <Megaphone className="size-4 shrink-0 text-ochre-ink" />
      <p
        key={latest.id}
        aria-live="polite"
        className="announcement-slide min-w-0 flex-1 truncate text-center"
      >
        <span className="font-semibold">{CATEGORY[latest.category].label}:</span> {latest.title} —{" "}
        <Link to="/portal/updates" className="font-semibold text-ochre-ink underline">
          click here to view the details
        </Link>
      </p>
      {items.length > 1 && (
        <span className="hidden shrink-0 gap-1 sm:flex" aria-hidden>
          {items.map((u, n) => (
            <span
              key={u.id}
              className={`size-1.5 rounded-full ${n === i ? "bg-ochre" : "bg-ochre/35"}`}
            />
          ))}
        </span>
      )}
      <button
        type="button"
        aria-label="Dismiss announcements"
        onClick={() => setHidden(true)}
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

// The signed-in workspace uses the whole screen: an announcement strip, a header with drop-down
// menus, search and the signed-in person, a narrow icon rail on the left, and the page filling
// the rest. The public website header and footer are not shown here.
export function PortalShell({ children }) {
  const { role, profile, rows, myRow } = useCampus();
  const { refresh } = useAccount();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rail, setRail] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem("orbit-rail") === "closed") setRail(false);
    } catch {
      /* default open */
    }
  }, []);
  const toggleRail = () =>
    setRail((v) => {
      try {
        localStorage.setItem("orbit-rail", v ? "closed" : "open");
      } catch {
        /* not remembered */
      }
      return !v;
    });
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = NAV[role];
  const current =
    [...items].reverse().find((i) => (i.exact ? pathname === i.to : pathname.startsWith(i.to))) ??
    items[0];
  async function logout() {
    await qc.cancelQueries();
    qc.clear();
    await signOut();
    await refresh();
    await navigate({ to: "/auth", replace: true });
  }
  const name = profile.display_name || profile.email;
  const line1 = myRow ? `${myRow.s.id} | Sem ${myRow.s.semester}` : ROLE_LABEL[role];
  const line2 = myRow ? myRow.s.branch : profile.email;
  const menuBtn =
    "flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground data-[state=open]:bg-secondary data-[state=open]:text-foreground";
  return (
    <div data-role={role} className="min-h-screen">
      <LoadingBar />
      <AnnouncementStrip />
      <header className="sticky top-0 z-30 border-b border-rule bg-card/95 backdrop-blur">
        <div className="flex h-16 items-center gap-3 px-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
          >
            <Menu />
          </Button>
          <Brand />
          <nav className="ml-4 hidden items-center gap-0.5 lg:flex" aria-label="Menus">
            {MENUS[role].map((m) => (
              <DropdownMenu key={m.label}>
                <DropdownMenuTrigger className={menuBtn}>
                  {m.label}
                  <ChevronDown className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-52">
                  {m.items.map(([to, label]) => (
                    <DropdownMenuItem key={to + label} asChild>
                      <Link to={to}>{label}</Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <GlobalSearch role={role} rows={rows} onSignOut={logout} />
            <NotificationBell />
            <span className="hidden xl:block">
              <ThemeToggle />
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-3 rounded-full py-1 pl-3 pr-1.5 text-right transition-colors hover:bg-muted data-[state=open]:bg-muted">
                <span className="hidden min-w-0 leading-tight md:block">
                  <span className="block truncate text-sm font-semibold">{name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{line1}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{line2}</span>
                </span>
                <span className="flex size-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {initials(name)}
                </span>
                <ChevronDown className="size-4 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52">
                <DropdownMenuItem asChild>
                  <Link to="/portal/profile">My profile</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/reset-password">Change password</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={logout}>
                  <LogOut className="mr-2 size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {open && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-ink/55 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-ink text-hero-foreground transition-transform lg:hidden ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/12 px-4">
          <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-white/70">
            {ROLE_LABEL[role]}
          </span>
          <button type="button" aria-label="Close menu" onClick={() => setOpen(false)}>
            <X className="size-5" />
          </button>
        </div>
        <nav aria-label="Workspace" className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              activeOptions={{ exact: Boolean(item.exact) }}
              className="flex items-center gap-3 border-l-2 border-transparent px-3 py-2.5 text-sm text-white/75 transition-colors hover:bg-white/8 hover:text-white"
              activeProps={{
                className: "!border-ochre !bg-white/10 !text-white font-semibold",
              }}
            >
              <item.icon className="size-[18px]" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-white/12 p-3">
          <ThemeToggle />
          <button
            type="button"
            onClick={logout}
            className="mt-2 flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="size-[18px]" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex">
        <aside
          aria-label="Shortcuts"
          className={`sticky top-16 hidden h-[calc(100vh-4rem)] shrink-0 flex-col overflow-y-auto border-r border-ink-strong bg-ink text-hero-foreground transition-[width] duration-200 print:hidden lg:flex ${rail ? "w-24" : "w-0"}`}
        >
          {RAIL[role].map(([to, label, icon]) => {
            const Icon = RAIL_ICON[icon];
            return (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: to === "/portal" }}
                className="flex flex-col items-center gap-1.5 border-b border-white/10 border-l-[3px] border-l-transparent px-1 py-4 text-center text-[12px] font-medium text-white/75 transition-colors hover:bg-white/8 hover:text-white"
                activeProps={{
                  className: "!border-l-ochre !bg-white/10 !text-white font-semibold",
                }}
              >
                <Icon className="size-6" />
                {label}
              </Link>
            );
          })}
        </aside>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 px-4 pt-3 text-sm text-muted-foreground sm:px-6 print:hidden">
            <button
              type="button"
              onClick={toggleRail}
              aria-label={rail ? "Hide shortcuts" : "Show shortcuts"}
              className="hidden size-8 items-center justify-center rounded-md border border-rule bg-card transition-colors hover:border-ochre hover:bg-ochre-pale hover:text-foreground lg:flex"
            >
              {rail ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
            <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-label">
              {ROLE_LABEL[role]} workspace
            </span>
            <span aria-hidden className="text-rule-strong">
              /
            </span>
            <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-foreground">
              {current.label}
            </span>
          </div>
          <main key={pathname} className="portal-page min-w-0 p-4 sm:p-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

/** Shows a page only to the roles it is meant for. The server enforces the real permissions. */
export function RoleGate({ allow, children }) {
  const { role } = useCampus();
  if (allow.includes(role)) return children;
  return (
    <div className="rounded-lg border border-dashed border-rule-strong bg-secondary/40 p-8 text-center">
      <p className="font-medium">This page is not part of your workspace.</p>
      <Button asChild variant="outline" className="mt-4">
        <Link to="/portal">Go to Overview</Link>
      </Button>
    </div>
  );
}

/** The greeting at the top of each role's overview. `children` fill the right-hand side. */
export function Banner({ title, sub, children }) {
  const date = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return (
    <div className="relative mb-6 overflow-hidden rounded-lg bg-ink p-6 text-hero-foreground sm:p-8">
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-ochre" />
      <div className="relative flex flex-wrap items-center justify-between gap-6">
        <div className="min-w-0">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-white/65">
            {date}
          </p>
          <h1 className="mt-2.5 font-display text-[1.875rem] font-semibold leading-[1.1] tracking-[-0.025em] sm:text-[2.375rem]">
            {title}
          </h1>
          {sub && <p className="mt-2.5 text-sm text-hero-muted">{sub}</p>}
        </div>
        {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
      </div>
    </div>
  );
}

/** A frosted tile for headline numbers inside the Banner. */
export function BannerStat({ label, value }) {
  return (
    <div className="min-w-24 border-t border-white/30 pt-2.5">
      <p className="text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-white/65">
        {label}
      </p>
      <p className="mt-1 font-numeric text-[1.75rem] font-semibold leading-none tracking-[-0.035em] tabular-nums">
        {value}
      </p>
    </div>
  );
}

export function PageTitle({ title, sub, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-rule pb-4">
      <div>
        <h1 className="font-display text-[1.625rem] font-semibold leading-[1.12] tracking-[-0.025em] sm:text-[2rem]">
          {title}
        </h1>
        {sub && (
          <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-muted-foreground">{sub}</p>
        )}
      </div>
      {children}
    </div>
  );
}
