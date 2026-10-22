import { Mail, MailOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/widgets";
import { ErrorState, PageSkeleton } from "@/components/ui-kit";
import { NotificationItem, useNotificationActions } from "@/components/portal/NotificationBell";
import { PageTitle } from "@/components/portal/PortalShell";
import { useNotifications } from "@/lib/use-platform";

export function NotificationsPage() {
  const { data, isLoading, error, refetch } = useNotifications();
  const { toggle, markAll, busy } = useNotificationActions();
  return (
    <>
      <PageTitle
        title="Notifications"
        sub="Alerts raised by attendance, deadline, marks and risk rules, plus updates from your teachers"
      >
        <Button type="button" variant="outline" disabled={busy || !data?.unread} onClick={markAll}>
          <MailOpen /> Mark all as read
        </Button>
      </PageTitle>
      {isLoading ? (
        <PageSkeleton rows={3} />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !data.items.length ? (
        <EmptyState
          title="No notifications yet"
          hint="They appear here when a rule fires, for example an approaching deadline or low attendance."
        />
      ) : (
        <div className="surface overflow-hidden">
          <p className="flex items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
            <Mail className="size-4" /> {data.unread} unread of {data.items.length}
          </p>
          <ul>
            {data.items.map((n) => (
              <NotificationItem key={n.id} n={n} onToggle={toggle} />
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
