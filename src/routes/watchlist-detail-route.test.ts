import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { isNotFound } from "@tanstack/react-router";
import { watchlistDetailQueryKey } from "@/features/watchlists/detail/query";
import type { WatchlistDetailPage } from "@/models/watchlist";

const { getWatchlistDetailPageMock } = vi.hoisted(() => ({
  getWatchlistDetailPageMock: vi.fn(),
}));

vi.mock("@/features/watchlists/detail/query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/watchlists/detail/query")>();

  return {
    ...actual,
    getWatchlistDetailPage: getWatchlistDetailPageMock,
  };
});

type WatchlistDetailRouteModule = typeof import("./watchlists/$watchlistId");
let WatchlistDetailRoute: WatchlistDetailRouteModule["Route"];

async function loadWatchlistDetailRoute({
  queryClient,
  watchlistId,
}: {
  queryClient: QueryClient;
  watchlistId: string;
}) {
  WatchlistDetailRoute ??= (await import("./watchlists/$watchlistId")).Route;
  const loader = WatchlistDetailRoute.options.loader;

  const loaderFn =
    typeof loader === "function" ? loader : (loader as unknown as { loader: typeof loader }).loader;

  if (!loaderFn) {
    throw new Error("Watchlist detail route must define a loader");
  }

  return (loaderFn as (args: unknown) => unknown)({
    context: { queryClient },
    params: { watchlistId },
  });
}

function makeDetailPage(watchlistId: number): WatchlistDetailPage {
  return {
    watchlist: {
      id: watchlistId,
      name: "Route Loaded",
      description: null,
      createdAt: "2024-01-01 00:00:00",
      updatedAt: null,
      lastWatchedAt: null,
      lastItemAddedAt: null,
      stats: {
        totalItems: 1,
        watchedItems: 0,
        progress: 0,
        nextUnwatched: null,
        coverImage: null,
        coverMediaType: null,
      },
    },
    items: [
      {
        id: 10,
        watchlistId,
        tmdbId: "movie-1",
        source: "tmdb",
        mediaType: "movie",
        title: "Route Item",
        parentTitle: null,
        season: null,
        episode: null,
        posterPath: null,
        releaseDate: "2024-01-01",
        voteAverage: null,
        runtime: null,
        isWatched: false,
        addedAt: "2024-01-01 00:00:00",
      },
    ],
  };
}

describe("watchlist detail route loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects partial numeric watchlist params instead of loading the parsed prefix", async () => {
    getWatchlistDetailPageMock.mockResolvedValue(makeDetailPage(42));
    const queryClient = new QueryClient();
    let thrown: unknown;

    try {
      await loadWatchlistDetailRoute({
        queryClient,
        watchlistId: "42-extra",
      });
    } catch (error) {
      thrown = error;
    }

    expect(isNotFound(thrown)).toBe(true);
    expect(getWatchlistDetailPageMock).not.toHaveBeenCalled();
    expect(queryClient.getQueriesData({ queryKey: ["watchlists"] })).toEqual([]);
  });

  it("rejects non-decimal numeric formats", async () => {
    getWatchlistDetailPageMock.mockResolvedValue(makeDetailPage(100));
    const queryClient = new QueryClient();
    let thrown: unknown;

    try {
      await loadWatchlistDetailRoute({
        queryClient,
        watchlistId: "1e2",
      });
    } catch (error) {
      thrown = error;
    }

    expect(isNotFound(thrown)).toBe(true);
    expect(getWatchlistDetailPageMock).not.toHaveBeenCalled();
  });

  it("loads the first unwatched detail page and seeds the shared detail cache", async () => {
    const detailPage = makeDetailPage(42);
    getWatchlistDetailPageMock.mockResolvedValue(detailPage);

    const queryClient = new QueryClient();

    const loadedDetail = await loadWatchlistDetailRoute({
      queryClient,
      watchlistId: "42",
    });

    const queryKey = watchlistDetailQueryKey({ watchlistId: 42, unwatchedOnly: true });

    expect(getWatchlistDetailPageMock).toHaveBeenCalledWith({
      data: { watchlistId: 42, unwatchedOnly: true, cursor: 1 },
    });
    expect(loadedDetail).toBe(detailPage);
    expect(queryClient.getQueryData(queryKey)).toEqual({
      pages: [detailPage],
      pageParams: [1],
    });
  });
});
