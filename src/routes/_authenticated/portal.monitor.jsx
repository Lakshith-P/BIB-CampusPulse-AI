import { createFileRoute } from "@tanstack/react-router";
import { MonitorPage } from "@/components/portal/StaffPages";
import { pageHead } from "@/lib/metadata";

export const Route = createFileRoute("/_authenticated/portal/monitor")({
  head: () => pageHead("Attendance & risk", "Attendance & risk in your BIB InsightIQ workspace."),
  component: MonitorPage,
});
