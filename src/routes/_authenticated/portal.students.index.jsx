import { createFileRoute } from "@tanstack/react-router";
import { StudentsPage } from "@/components/portal/StaffPages";
import { pageHead } from "@/lib/metadata";

export const Route = createFileRoute("/_authenticated/portal/students/")({
  head: () => pageHead("Students", "Students in your BIB InsightIQ workspace."),
  component: StudentsPage,
});
