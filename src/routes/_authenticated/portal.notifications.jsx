import { createFileRoute } from "@tanstack/react-router";
import { NotificationsPage } from "@/components/portal/NotificationCentre";
import { pageHead } from "@/lib/metadata";

export const Route = createFileRoute("/_authenticated/portal/notifications")({
  head: () => pageHead("Notifications", "Your alerts and updates in your BIB InsightIQ workspace."),
  component: NotificationsPage,
});
