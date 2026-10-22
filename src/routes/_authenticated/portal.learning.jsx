import { createFileRoute } from "@tanstack/react-router";
import { LearningPage } from "@/components/portal/StudentPages";
import { pageHead } from "@/lib/metadata";

export const Route = createFileRoute("/_authenticated/portal/learning")({
  head: () => pageHead("Learning path", "Learning path in your BIB InsightIQ workspace."),
  component: LearningPage,
});
