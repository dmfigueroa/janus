// @vitest-environment jsdom

import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WatchlistDetailPage } from "@/features/watchlists/detail/Query";

const mocks = vi.hoisted(() => ({
  getWatchlistDetailPage: vi.fn(),
  ensureCustomLineup: vi.fn(),
}));

vi.mock("@/features/watchlists/detail/Query.server", () => ({
  getWatchlistDetail: mocks.getWatchlistDetailPage,
}));

vi.mock("@tanstack/react-start", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-start")>();
  return {
    ...actual,
    createServerFn: () => {
      const chain = {
        inputValidator: () => chain,
        validator: () => chain,
        handler: () => mocks.getWatchlistDetailPage,
      };
      return chain;
    },
  };
});

vi.mock("@/features/watchlists/detail/WatchlistDetailScreen", () => ({
  WatchlistDetailScreen: () => null,
}));

vi.mock("@/features/lineups/read/useLineupData", () => ({
  ensureCustomLineup: mocks.ensureCustomLineup,
  findCustomLineup: vi.fn(),
  useLineupData: vi.fn(),
}));

vi.mock("@/features/lineups/components/LineupEditor", () => ({
  LineupEditor: () => null,
}));

vi.mock("@/features/lineups/components/LineupCards", () => ({
  LineupCards: () => null,
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (config: unknown) => config,
  };
});

import { Route as WatchlistDetailRoute } from "@/routes/watchlists/$watchlistId";
import { Route as CustomLineupRoute } from "@/routes/rotations.custom.$lineupId";
import { watchlistDetailQueryKey } from "@/features/watchlists/detail/Query";

const detailRoute = WatchlistDetailRoute as unknown as {
  beforeLoad: (input: { params: { watchlistId: string } }) => { watchlistId: number };
  loader: (input: {
    context: { queryClient: QueryClient; watchlistId: number };
  }) => Promise<{ watchlistName: string }>;
  head: (input: { loaderData?: { watchlistName: string } }) => { meta: Array<{ title: string }> };
};

const lineupRoute = CustomLineupRoute as unknown as {
  beforeLoad: (input: { params: { lineupId: string } }) => { lineupId: number };
  loader: (input: { context: { queryClient: QueryClient; lineupId: number } }) => Promise<void>;
};

function sampleDetailPage(): WatchlistDetailPage {
  return {
    watchlist: {
      id: 42,
      name: "Sci-Fi Classics",
      description: null,
      itemOrderMode: "custom",
      createdAt: "2024-01-01 00:00:00",
      updatedAt: null,
      lastWatchedAt: null,
      lastItemAddedAt: null,
      pausedAt: null,
      stats: {
        totalItems: 0,
        watchedItems: 0,
        progress: 0,
        nextUnwatched: null,
        coverImage: null,
        coverMediaType: null,
      },
    },
    items: [],
  };
}

describe("watchlist detail route boundary", () => {
  beforeEach(() => {
    mocks.getWatchlistDetailPage.mockReset();
    mocks.ensureCustomLineup.mockReset();
  });

  it.each(["abc", "12abc", "0", "-5", "12.5", " 12 ", "1e2", "9007199254740992"])(
    "throws notFound before calling any server function for invalid $watchlistId %j",
    (rawId) => {
      let thrown: unknown;
      try {
        detailRoute.beforeLoad({ params: { watchlistId: rawId } });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toMatchObject({ isNotFound: true });
      expect(mocks.getWatchlistDetailPage).not.toHaveBeenCalled();
    },
  );

  it("primes the canonical infinite query key and exposes the watchlist title for head", async () => {
    const queryClient = new QueryClient();
    const page = sampleDetailPage();
    mocks.getWatchlistDetailPage.mockResolvedValue(page);

    const parsed = detailRoute.beforeLoad({ params: { watchlistId: "42" } });
    expect(parsed).toEqual({ watchlistId: 42 });

    const loaderData = await detailRoute.loader({
      context: { queryClient, watchlistId: parsed.watchlistId },
    });

    expect(loaderData).toEqual({ watchlistName: "Sci-Fi Classics" });
    expect(detailRoute.head({ loaderData })).toEqual({
      meta: [{ title: "Sci-Fi Classics - Janus" }],
    });
    expect(mocks.getWatchlistDetailPage).toHaveBeenCalledTimes(1);
    expect(mocks.getWatchlistDetailPage).toHaveBeenCalledWith({
      data: { watchlistId: 42, pageSize: 50, unwatchedOnly: false, cursor: 1 },
    });
    expect(
      queryClient.getQueryData(watchlistDetailQueryKey({ watchlistId: 42, unwatchedOnly: false })),
    ).toEqual({
      pages: [page],
      pageParams: [1],
    });
  });

  it("throws notFound when the server function returns null for a missing watchlist", async () => {
    const queryClient = new QueryClient();
    mocks.getWatchlistDetailPage.mockResolvedValue(null);

    await expect(
      detailRoute.loader({
        context: { queryClient, watchlistId: 999 },
      }),
    ).rejects.toMatchObject({ isNotFound: true });
  });

  it.each(["abc", "12abc", "0", "-1", " 7 ", "1e2"])(
    "throws notFound at the route boundary for invalid $lineupId %j",
    (rawId) => {
      let thrown: unknown;
      try {
        lineupRoute.beforeLoad({ params: { lineupId: rawId } });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toMatchObject({ isNotFound: true });
      expect(mocks.ensureCustomLineup).not.toHaveBeenCalled();
    },
  );
});
