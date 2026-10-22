import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/components/portal/StaffPages";
import { pageHead } from "@/lib/metadata";

export const Route = createFileRoute("/_authenticated/portal/records")({
  head: () => pageHead("Student records", "Student records in your BIB InsightIQ workspace."),
  component: RecordsPage,
});
