import { createFileRoute } from "@tanstack/react-router";
import { AssignPage } from "@/components/portal/StaffPages";
import { pageHead } from "@/lib/metadata";

export const Route = createFileRoute("/_authenticated/portal/assign")({
  head: () => pageHead("Assign students", "Assign students in your BIB InsightIQ workspace."),
  component: AssignPage,
});
