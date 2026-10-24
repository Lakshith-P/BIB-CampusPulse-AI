import { createFileRoute } from "@tanstack/react-router";
import { StudentInsightsPage } from "@/components/portal/StudentDashboard";
import { pageHead } from "@/lib/metadata";

export const Route = createFileRoute("/_authenticated/portal/insights")({
  head: () =>
    pageHead(
      "Predictive Risk & AI",
      "Risk flags and Success Score drivers in your SLQG workspace.",
    ),
  component: StudentInsightsPage,
});
