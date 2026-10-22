import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getSession } from "@/lib/auth.functions";
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  // The session is cached for a minute, so moving between pages does not wait on the server.
  beforeLoad: async ({ context }) => {
    // fetchQuery honours staleness, so a sign-in (which invalidates this) is seen straight away.
    const user = await context.queryClient
      .fetchQuery({ queryKey: ["session"], queryFn: () => getSession(), staleTime: 60_000 })
      .catch(() => null);
    if (!user) {
      // Never remember "signed out": the next sign-in must not be bounced by a stale answer.
      context.queryClient.removeQueries({ queryKey: ["session"] });
      throw redirect({ to: "/auth" });
    }
  },
  component: () => <Outlet />,
});
