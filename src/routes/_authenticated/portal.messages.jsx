import { createFileRoute } from "@tanstack/react-router";
import { MessagesPage } from "@/components/portal/StaffPages";
import { pageHead } from "@/lib/metadata";

export const Route = createFileRoute("/_authenticated/portal/messages")({
  head: () => pageHead("Messages", "Messages in your BIB InsightIQ workspace."),
  component: MessagesPage,
});
