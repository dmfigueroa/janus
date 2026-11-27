import { createRouter, isNotFound } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { QueryClient } from "@tanstack/react-query";

import { routeTree } from "./routeTree.gen";

export const DEFAULT_QUERY_STALE_TIME_MS = 30_000;

export function shouldRetryQuery(failureCount: number, error: unknown) {
  if (isNotFound(error)) {
    return false;
  }

  return failureCount < 3;
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: DEFAULT_QUERY_STALE_TIME_MS,
        retry: shouldRetryQuery,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: {
      queryClient,
    },

    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });

  setupRouterSsrQueryIntegration({
    router,
    queryClient,
    wrapQueryClient: true,
  });

  return router;
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
