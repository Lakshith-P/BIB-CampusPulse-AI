import { createFileRoute } from "@tanstack/react-router";
import { ResultsPage } from "@/components/portal/ResultsPages";
import { pageHead } from "@/lib/metadata";

export const Route = createFileRoute("/_authenticated/portal/results")({
  head: () => pageHead("Results", "Academic results in your BIB InsightIQ workspace."),
  component: ResultsPage,
});
