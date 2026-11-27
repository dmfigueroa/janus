// @vitest-environment jsdom

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, notFound } from "@tanstack/react-router";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/routeTree.gen", () => ({
  routeTree: createRootRouteWithContext<{ queryClient: QueryClient }>()({}),
}));

import { DEFAULT_QUERY_STALE_TIME_MS, getRouter, shouldRetryQuery } from "@/router";
import { lineupsQueryOptions } from "@/features/lineups/read/useLineupData";
import { watchlistHomeQueryOptions } from "@/features/watchlists/home/useWatchlistHomeData";

function QueryClientProbe() {
  const client = useQueryClient();
  const staleTime = client.getDefaultOptions().queries?.staleTime;
  return <div data-testid="stale-time">{String(staleTime)}</div>;
}

describe("router query integration", () => {
  afterEach(() => {
    cleanup();
  });

  it("configures explicit default staleTime, keeps defaultPreloadStaleTime at 0, and wraps QueryClientProvider", () => {
    const router = getRouter();
    const { queryClient } = router.options.context;

    expect(router.options.defaultPreloadStaleTime).toBe(0);
    expect(queryClient.getDefaultOptions().queries?.staleTime).toBe(DEFAULT_QUERY_STALE_TIME_MS);

    const RouterWrap = router.options.Wrap;
    expect(RouterWrap).toBeDefined();
    if (!RouterWrap) {
      return;
    }

    render(
      <RouterWrap>
        <QueryClientProbe />
      </RouterWrap>,
    );

    expect(screen.getByTestId("stale-time").textContent).toBe(String(DEFAULT_QUERY_STALE_TIME_MS));
  });

  it("does not retry notFound errors while retrying ordinary failures", () => {
    const router = getRouter();
    const retry = router.options.context.queryClient.getDefaultOptions().queries?.retry;

    expect(retry).toBe(shouldRetryQuery);
    expect(shouldRetryQuery(0, notFound())).toBe(false);
    expect(shouldRetryQuery(0, new Error("transient"))).toBe(true);
    expect(shouldRetryQuery(3, new Error("transient"))).toBe(false);
  });

  it("preserves the 2s overview staleTime contract on Watch Now and My Lists", () => {
    expect(lineupsQueryOptions().staleTime).toBe(2_000);
    expect(watchlistHomeQueryOptions().staleTime).toBe(2_000);
  });
});
