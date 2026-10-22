import { createFileRoute } from "@tanstack/react-router";
import { ProfilePage } from "@/components/portal/ProfilePage";
import { pageHead } from "@/lib/metadata";

export const Route = createFileRoute("/_authenticated/portal/profile")({
  head: () => pageHead("Profile", "Profile in your BIB InsightIQ workspace."),
  component: ProfilePage,
});
