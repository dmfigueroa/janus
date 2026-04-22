import { describe, expect, it, vi } from "vitest";
import type { WatchlistListScreenSummary } from "@/features/watchlists/read.server";

const { getWatchlistListMock } = vi.hoisted(() => ({
  getWatchlistListMock: vi.fn(),
}));

vi.mock("@/features/watchlists/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/watchlists/queries")>();

  return {
    ...actual,
    getWatchlistList: getWatchlistListMock,
  };
});

type IndexRouteModule = typeof import("./index");
let IndexRoute: IndexRouteModule["Route"];

async function loadWatchlistListRoute() {
  IndexRoute ??= (await import("./index")).Route;
  const loader = IndexRoute.options.loader;

  const loaderFn =
    typeof loader === "function" ? loader : (loader as unknown as { loader: typeof loader }).loader;

  if (!loaderFn) {
    throw new Error("Watchlist list route must define a loader");
  }

  return (loaderFn as (args: unknown) => unknown)({});
}

function makeWatchlistSummary(): WatchlistListScreenSummary {
  return {
    id: 1,
    name: "Route List",
    description: null,
    createdAt: "2024-01-01 00:00:00",
    updatedAt: null,
    lastWatchedAt: null,
    lastItemAddedAt: null,
    stats: {
      totalItems: 0,
      watchedItems: 0,
      progress: 0,
      nextUnwatched: null,
      coverImage: null,
      coverMediaType: null,
    },
  };
}

describe("watchlist list route loader", () => {
  it("loads the list screen through the feature query boundary with route defaults", async () => {
    const summaries = [makeWatchlistSummary()];
    getWatchlistListMock.mockResolvedValue(summaries);

    const loadedSummaries = await loadWatchlistListRoute();

    expect(getWatchlistListMock).toHaveBeenCalledWith({
      data: { orderBy: "lastWatched", order: "asc" },
    });
    expect(loadedSummaries).toBe(summaries);
  });
});
