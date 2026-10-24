import { createFileRoute } from "@tanstack/react-router";
import { AnalyticsCopilotPage } from "@/components/portal/AnalyticsCopilot";
import { pageHead } from "@/lib/metadata";

export const Route = createFileRoute("/_authenticated/portal/copilot")({
  head: () =>
    pageHead(
      "Analytics Copilot",
      "Ask questions about student performance and get answers with the evidence behind them.",
    ),
  component: AnalyticsCopilotPage,
});
