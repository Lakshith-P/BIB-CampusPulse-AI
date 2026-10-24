import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SlqgLoaderScreen } from "@/components/SlqgLoader";
import { PortalShell } from "@/components/portal/PortalShell";
import { ToastProvider } from "@/components/ui-kit";
import { pageHead } from "@/lib/metadata";
import { campusOptions } from "@/lib/use-campus";

export const Route = createFileRoute("/_authenticated/portal")({
  head: () =>
    pageHead(
      "My Workspace",
      "Your authorized student records, scores and support plans, securely connected to your SLQG account.",
    ),
  loader: ({ context }) => context.queryClient.ensureQueryData(campusOptions),
  pendingMs: 0,
  pendingComponent: () => <SlqgLoaderScreen label="Loading your workspace" />,
  component: () => (
    <ToastProvider>
      <PortalShell>
        <Outlet />
      </PortalShell>
    </ToastProvider>
  ),
});
