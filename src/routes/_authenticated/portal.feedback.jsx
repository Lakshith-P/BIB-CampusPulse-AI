import { createFileRoute } from "@tanstack/react-router";
import { FeedbackPage } from "@/components/portal/StudentPages";
import { pageHead } from "@/lib/metadata";

export const Route = createFileRoute("/_authenticated/portal/feedback")({
  head: () => pageHead("Feedback", "Feedback in your BIB InsightIQ workspace."),
  component: FeedbackPage,
});
