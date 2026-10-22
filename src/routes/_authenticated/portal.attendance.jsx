import { createFileRoute } from "@tanstack/react-router";
import { AttendancePage } from "@/components/portal/StudentPages";
import { pageHead } from "@/lib/metadata";

export const Route = createFileRoute("/_authenticated/portal/attendance")({
  head: () => pageHead("Attendance", "Attendance in your BIB InsightIQ workspace."),
  component: AttendancePage,
});
