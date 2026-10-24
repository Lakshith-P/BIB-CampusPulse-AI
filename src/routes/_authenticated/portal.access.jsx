import { createFileRoute } from "@tanstack/react-router";
import { AccessPage } from "@/components/portal/AccessPage";
import { pageHead } from "@/lib/metadata";

export const Route = createFileRoute("/_authenticated/portal/access")({
  head: () =>
    pageHead("Login credentials", "Register students and teachers, and approve password requests."),
  component: AccessPage,
});
