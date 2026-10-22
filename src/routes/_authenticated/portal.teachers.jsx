import { createFileRoute } from "@tanstack/react-router";
import { TeachersPage } from "@/components/portal/StaffPages";
import { pageHead } from "@/lib/metadata";

export const Route = createFileRoute("/_authenticated/portal/teachers")({
  head: () => pageHead("Teachers", "Teachers in your BIB InsightIQ workspace."),
  component: TeachersPage,
});
