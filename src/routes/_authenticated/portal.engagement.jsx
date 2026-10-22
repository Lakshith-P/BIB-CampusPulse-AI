import { createFileRoute } from "@tanstack/react-router";
import { EngagementPage } from "@/components/portal/StudentPages";
import { pageHead } from "@/lib/metadata";

export const Route = createFileRoute("/_authenticated/portal/engagement")({
  head: () => pageHead("Engagement", "Engagement in your BIB InsightIQ workspace."),
  component: EngagementPage,
});
