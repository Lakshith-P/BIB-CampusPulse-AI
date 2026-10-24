import { createFileRoute } from "@tanstack/react-router";
import { PredictionsPage } from "@/components/portal/PredictionsPage";
import { pageHead } from "@/lib/metadata";

export const Route = createFileRoute("/_authenticated/portal/predictions")({
  head: () => pageHead("Predictions", "Placement and result predictions, risk and actions."),
  component: PredictionsPage,
});
