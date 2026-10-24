import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  BadgeCheck,
  Bell,
  BookOpen,
  Briefcase,
  CalendarCheck,
  ChevronDown,
  Download,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  MessageCircle,
  MessageSquare,
  Sparkles,
  Terminal,
  Trophy,
  UserRound,
  X,
} from "lucide-react";
import { GlobalSearch } from "@/components/portal/GlobalSearch";
import { NotificationBell } from "@/components/portal/NotificationBell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const PRODUCT = "BIB InsightIQ";

const PRIMARY = [
  { to: "/portal", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/portal/results", label: "Academics", icon: GraduationCap },
  { to: "/portal/attendance", label: "Attendance Planner", icon: CalendarCheck },
  { to: "/portal/insights", label: "Predictive Risk & AI", icon: Sparkles },
  { to: "/portal/lms", label: "Learning & LMS", icon: BookOpen },
  { to: "/portal/placement", label: "Placement & Careers", icon: Briefcase },
  { to: "/portal/skills", label: "Skills & Coding", icon: Terminal },
];
const MORE = [
  { to: "/portal/notifications", label: "Notifications", icon: Bell },
  { to: "/portal/updates", label: "Announcements", icon: Megaphone },
  { to: "/portal/learning", label: "Learning path", icon: Sparkles },
  { to: "/portal/chat", label: "Chats", icon: MessageCircle },
  { to: "/portal/engagement", label: "Engagement", icon: Trophy },
  { to: "/portal/feedback", label: "Feedback", icon: MessageSquare },
  { to: "/portal/profile", label: "Profile", icon: UserRound },
];

const initials = (name) =>
  (name || "")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";

function NavItem({ item, onNavigate }) {
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      activeOptions={{ exact: Boolean(item.exact) }}
      className="group flex items-center gap-2 rounded-lg px-4 py-2 text-xs text-slate-600 transition-all hover:bg-slate-100 hover:text-slate-900"
      activeProps={{ className: "cp-nav-active" }}
    >
      <item.icon className="cp-nav-icon size-5 shrink-0 text-slate-400" />
      <span>{item.label}</span>
    </Link>
  );
}

function Sidebar({ name, program, onNavigate }) {
  return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex min-h-0 flex-col">
        <div className="border-b border-slate-200 p-4">
          <Link to="/portal" className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-[#00338D] font-bold tracking-tight text-white shadow-sm">
              BI
            </span>
            <span>
              <span className="flex items-center gap-1.5">
                <span className="cp-display block text-sm font-bold leading-tight tracking-tight text-[#00338D]">
                  {PRODUCT}
                </span>
                <span className="rounded bg-blue-100 px-1.5 text-[9px] font-bold uppercase tracking-wider text-[#00338D]">
                  AI
                </span>
              </span>
              <span className="block text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                Student Success Platform
              </span>
            </span>
          </Link>
        </div>
        <nav aria-label="Workspace" className="flex min-h-0 flex-col gap-1 overflow-y-auto p-2">
          {PRIMARY.map((item) => (
            <NavItem key={item.to} item={item} onNavigate={onNavigate} />
          ))}
          <p className="mt-3 px-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            More
          </p>
          {MORE.map((item) => (
            <NavItem key={item.to} item={item} onNavigate={onNavigate} />
          ))}
        </nav>
      </div>
      <div className="border-t border-slate-200 bg-white p-2">
        <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded bg-[#00338D] text-xs font-bold text-white">
              {initials(name)}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-xs font-semibold leading-tight text-slate-900">
                {name}
              </span>
              <span className="truncate text-[10px] text-slate-400">{program}</span>
            </span>
          </div>
          <BadgeCheck className="size-[18px] shrink-0 text-slate-400" />
        </div>
      </div>
    </div>
  );
}

/**
 * The student workspace: a white labelled sidebar on the left, a slim header with search, the
 * active term, notifications and the signed-in student, and the page on a cool grey canvas.
 */
export function StudentShell({ profile, myRow, rows, onSignOut, children }) {
  const [open, setOpen] = useState(false);
  const name = profile.display_name || profile.email;
  const s = myRow?.s;
  const program = s ? `${s.course || s.branch} · Sem ${s.semester}` : "Student";
  const term = s ? `Semester ${s.semester} · Class of ${s.gradYear}` : null;
  return (
    <div data-role="student" className="cp-shell min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-72 border-r border-slate-200 bg-white shadow-[0_1px_8px_rgba(0,0,0,0.04)] print:hidden lg:block">
        <Sidebar name={name} program={program} />
      </aside>

      {open && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-xl transition-transform lg:hidden ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="absolute right-3 top-4 text-slate-400 hover:text-slate-700"
        >
          <X className="size-5" />
        </button>
        <Sidebar name={name} program={program} onNavigate={() => setOpen(false)} />
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-[#D9E1EC] bg-white/90 px-4 backdrop-blur-xl print:hidden sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setOpen(true)}
              className="rounded p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
            >
              <Menu className="size-5" />
            </button>
            <GlobalSearch role="student" rows={rows} onSignOut={onSignOut} />
          </div>
          <div className="flex items-center gap-3">
            {term && (
              <span className="hidden items-center gap-1.5 rounded-full border border-[#A7F3D0] bg-[#ECFDF5] px-3 py-1 text-xs font-semibold tracking-wide text-[#047857] md:inline-flex">
                <span className="size-1.5 rounded-full bg-[#10B981]" />
                {term}
              </span>
            )}
            <NotificationBell />
            <button
              type="button"
              onClick={() => window.print()}
              className="hidden items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition-colors hover:bg-slate-50 sm:inline-flex"
            >
              <Download className="size-4 text-slate-500" />
              Export Term Brief
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 border-l border-slate-200 pl-2 text-left">
                <span className="flex size-8 items-center justify-center rounded-full bg-[#00338D] text-xs font-bold tracking-wider text-white">
                  {initials(name)}
                </span>
                <span className="hidden flex-col md:flex">
                  <span className="text-xs font-semibold leading-tight text-slate-900">{name}</span>
                  <span className="text-[10px] text-slate-400">{program}</span>
                </span>
                <ChevronDown className="size-4 text-slate-400" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52">
                <DropdownMenuItem asChild>
                  <Link to="/portal/profile">My profile</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/reset-password">Change password</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onSignOut}>
                  <LogOut className="mr-2 size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="portal-page min-h-[calc(100vh-4rem)] w-full px-4 py-4 sm:px-6">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
