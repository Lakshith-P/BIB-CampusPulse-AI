import { createFileRoute } from "@tanstack/react-router";
import { LmsPage } from "@/components/portal/StudentPages";
import { pageHead } from "@/lib/metadata";

export const Route = createFileRoute("/_authenticated/portal/lms")({
  head: () => pageHead("LMS", "LMS in your BIB InsightIQ workspace."),
  component: LmsPage,
});
