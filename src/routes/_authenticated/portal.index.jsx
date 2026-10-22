import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "@/components/portal/HomePages";
import { pageHead } from "@/lib/metadata";

export const Route = createFileRoute("/_authenticated/portal/")({
  head: () => pageHead("Overview", "Your BIB InsightIQ overview."),
  component: HomePage,
});
