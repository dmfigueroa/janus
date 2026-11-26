// @vitest-environment jsdom

import { Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@test/utils/Render";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installForegroundRevalidation } from "@/app/ForegroundRevalidation";
import type { LineupData } from "@/features/lineups/manage/Lineups";
import { lineupsQueryOptions, useLineupData } from "@/features/lineups/read/useLineupData";
import type { WatchlistHomeData } from "@/features/watchlists/home/WatchlistHome";
import {
  useWatchlistHomeData,
  watchlistHomeQueryOptions,
} from "@/features/watchlists/home/useWatchlistHomeData";

const mocks = vi.hoisted(() => ({
  getLineupData: vi.fn<() => Promise<LineupData>>(),
  getWatchlistHomeData: vi.fn<() => Promise<WatchlistHomeData>>(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    handler: (fn: unknown) => fn,
    validator: () => ({ handler: (fn: unknown) => fn }),
  }),
  useServerFn: (operation: unknown) => operation,
}));

vi.mock("@/features/lineups/manage/Lineups", () => ({
  getLineupData: mocks.getLineupData,
}));

vi.mock("@/features/watchlists/home/WatchlistHome", () => ({
  getWatchlistHomeData: mocks.getWatchlistHomeData,
}));

function lineupSnapshot(title: string): LineupData {
  return {
    lineups: [
      {
        id: 1,
        kind: "system",
        systemKey: "movie",
        name: title,
        enabled: true,
        rank: 0,
        reference: { kind: "system", key: "movie" },
        eligibleWatchlists: [],
        eligibleCount: 0,
      },
    ],
    watchlists: [],
  };
}

function homeSnapshot(count: number): WatchlistHomeData {
  return {
    totals: { watchlists: count, items: count },
    featuredSections: [],
    allWatchlists: [],
    rotation: [],
    completed: [],
    paused: [],
    empty: [],
  };
}

function setVisibilityState(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: state,
  });
}

function dispatchPageShow(persisted: boolean) {
  const event = new Event("pageshow") as PageTransitionEvent;
  Object.defineProperty(event, "persisted", { value: persisted });
  window.dispatchEvent(event);
}

function LineupProbe() {
  const { data } = useLineupData();
  return <div data-testid="lineup-name">{data.lineups[0]?.name}</div>;
}

function HomeProbe() {
  const { data } = useWatchlistHomeData();
  return <div data-testid="home-total">{data.totals.watchlists}</div>;
}

describe("overview foreground refresh", () => {
  let cleanupRevalidation: (() => void) | undefined;

  afterEach(() => {
    cleanupRevalidation?.();
    cleanupRevalidation = undefined;
    cleanup();
    setVisibilityState("visible");
    vi.clearAllMocks();
  });

  it("refreshes Watch Now on visibilitychange, persisted pageshow, and resume and deduplicates simultaneous wake events", async () => {
    setVisibilityState("visible");
    cleanupRevalidation = installForegroundRevalidation();
    const queryClient = new QueryClient();
    queryClient.setQueryData(lineupsQueryOptions().queryKey, lineupSnapshot("Initial Movies"));

    let resolveWakeFetch!: (value: LineupData) => void;
    mocks.getLineupData
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveWakeFetch = resolve;
          }),
      )
      .mockResolvedValueOnce(lineupSnapshot("After Bfcache"))
      .mockResolvedValueOnce(lineupSnapshot("After Resume"));

    render(
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={<div>loading</div>}>
          <LineupProbe />
        </Suspense>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("lineup-name").textContent).toBe("Initial Movies");
    expect(mocks.getLineupData).not.toHaveBeenCalled();

    act(() => {
      setVisibilityState("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
      setVisibilityState("visible");
      document.dispatchEvent(new Event("visibilitychange"));
      dispatchPageShow(true);
      document.dispatchEvent(new Event("resume"));
    });

    await waitFor(() => expect(mocks.getLineupData).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("lineup-name").textContent).toBe("Initial Movies");

    await act(async () => {
      resolveWakeFetch(lineupSnapshot("After Visibility"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("lineup-name").textContent).toBe("After Visibility"),
    );

    act(() => {
      dispatchPageShow(true);
    });
    await waitFor(() =>
      expect(screen.getByTestId("lineup-name").textContent).toBe("After Bfcache"),
    );

    act(() => {
      document.dispatchEvent(new Event("resume"));
    });
    await waitFor(() => expect(screen.getByTestId("lineup-name").textContent).toBe("After Resume"));
    expect(mocks.getLineupData).toHaveBeenCalledTimes(3);
  });

  it("refreshes My Lists when returning to the foreground", async () => {
    setVisibilityState("visible");
    cleanupRevalidation = installForegroundRevalidation();
    const queryClient = new QueryClient();
    queryClient.setQueryData(watchlistHomeQueryOptions().queryKey, homeSnapshot(4));
    mocks.getWatchlistHomeData.mockResolvedValueOnce(homeSnapshot(5));

    render(
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={<div>loading</div>}>
          <HomeProbe />
        </Suspense>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("home-total").textContent).toBe("4");

    act(() => {
      setVisibilityState("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
      setVisibilityState("visible");
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => expect(screen.getByTestId("home-total").textContent).toBe("5"));
    expect(mocks.getWatchlistHomeData).toHaveBeenCalledTimes(1);
  });
});
