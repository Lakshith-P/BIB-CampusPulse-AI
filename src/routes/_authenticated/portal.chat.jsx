import { createFileRoute } from "@tanstack/react-router";
import { DashboardChat } from "@/components/portal/DashboardChat";
import { pageHead } from "@/lib/metadata";

export const Route = createFileRoute("/_authenticated/portal/chat")({
  head: () => pageHead("Chats", "Section group and approved private chats."),
  component: DashboardChat,
});
