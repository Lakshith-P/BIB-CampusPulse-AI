import { createFileRoute } from "@tanstack/react-router";
import { ComplaintsPage } from "@/components/portal/FeedbackPages";
import { pageHead } from "@/lib/metadata";

export const Route = createFileRoute("/_authenticated/portal/complaints")({
  head: () => pageHead("Complaints", "Confidential complaints for administrators."),
  component: ComplaintsPage,
});
