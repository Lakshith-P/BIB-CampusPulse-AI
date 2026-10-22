import { createFileRoute } from "@tanstack/react-router";
import { AnnouncementsPage } from "@/components/portal/AnnouncementsPage";
import { pageHead } from "@/lib/metadata";

export const Route = createFileRoute("/_authenticated/portal/updates")({
  head: () =>
    pageHead("Announcements", "Placements, events, notices and posters from your university."),
  component: AnnouncementsPage,
});
