import { createFileRoute } from "@tanstack/react-router";
import { PlacementPage } from "@/components/portal/StudentPages";
import { pageHead } from "@/lib/metadata";

export const Route = createFileRoute("/_authenticated/portal/placement")({
  head: () => pageHead("Placement", "Placement in your BIB InsightIQ workspace."),
  component: PlacementPage,
});
