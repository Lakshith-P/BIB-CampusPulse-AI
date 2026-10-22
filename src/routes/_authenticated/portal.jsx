import { createFileRoute, Outlet } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { ToastProvider } from "@/components/ui-kit";
import { pageHead } from "@/lib/metadata";
import { campusOptions } from "@/lib/use-campus";

export const Route = createFileRoute("/_authenticated/portal")({
  head: () =>
    pageHead(
      "My Workspace",
      "Your authorized student records, scores and support plans, securely connected to your BIB InsightIQ account.",
    ),
  loader: ({ context }) => context.queryClient.ensureQueryData(campusOptions),
  pendingMs: 0,
  pendingComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-muted/40" role="status">
      <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
        <LoaderCircle className="size-8 animate-spin text-primary" />
        Loading your workspace…
      </div>
    </div>
  ),
  component: () => (
    <ToastProvider>
      <PortalShell>
        <Outlet />
      </PortalShell>
    </ToastProvider>
  ),
});
