import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
export const getRouter = () => {
  const queryClient = new QueryClient({
    // Pages share cached data, so moving between them is instant; changes invalidate explicitly.
    defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false } },
  });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultPreload: "intent",
    defaultPendingMs: 150,
  });
  return router;
};
