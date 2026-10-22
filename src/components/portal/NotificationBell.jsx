import { Link } from "@tanstack/react-router";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusPill, useAction } from "@/components/ui-kit";
import { markNotifications } from "@/lib/platform.functions";
import { useNotifications, useRefreshAll } from "@/lib/use-platform";

const TONE = { high: "danger", medium: "warning", low: "info" };
const LABEL = { high: "High priority", medium: "Medium priority", low: "For your information" };

function when(iso) {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function NotificationItem({ n, onToggle, compact = false }) {
  return (
    <li
      className={`flex gap-3 border-b p-3 last:border-0 ${n.read_at ? "opacity-70" : "bg-accent/40"}`}
    >
      <span
        className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-primary"}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={TONE[n.priority]}>{LABEL[n.priority]}</StatusPill>
          <span className="text-xs text-muted-foreground">
            {n.area} · {when(n.created_at)}
          </span>
          {!n.read_at && <span className="sr-only">Unread</span>}
        </div>
        <p className="mt-1 text-sm font-medium">{n.title}</p>
        {!compact && n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
        <div className="mt-1 flex gap-3 text-xs">
          <Link to={n.link} className="font-medium text-primary hover:underline">
            Open
          </Link>
          <button
            type="button"
            onClick={() => onToggle(n)}
            className="text-muted-foreground hover:text-foreground"
          >
            {n.read_at ? "Mark as unread" : "Mark as read"}
          </button>
        </div>
      </div>
    </li>
  );
}

export function useNotificationActions() {
  const refresh = useRefreshAll();
  const { busy, run } = useAction(refresh);
  return {
    busy,
    toggle: (n) => run(() => markNotifications({ data: { ids: [n.id], read: !n.read_at } })),
    markAll: () =>
      run(() => markNotifications({ data: { ids: null, read: true } }), "All caught up."),
  };
}

/** The bell in the header: unread count and the newest items. */
export function NotificationBell() {
  const { data } = useNotifications();
  const { toggle, markAll, busy } = useNotificationActions();
  const unread = data?.unread ?? 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted"
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold tabular-nums text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(24rem,calc(100vw-1rem))] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">Notifications</p>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={busy || !unread}
            onClick={markAll}
          >
            <CheckCheck /> Mark all read
          </Button>
        </div>
        <ul className="max-h-96 overflow-y-auto">
          {(data?.items ?? []).slice(0, 6).map((n) => (
            <NotificationItem key={n.id} n={n} onToggle={toggle} compact />
          ))}
          {!data?.items?.length && (
            <li className="p-6 text-center text-sm text-muted-foreground">Nothing yet.</li>
          )}
        </ul>
        <Link
          to="/portal/notifications"
          className="block border-t px-3 py-2 text-center text-sm font-medium text-primary hover:bg-muted"
        >
          See all notifications
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
