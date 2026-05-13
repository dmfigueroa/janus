import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { WatchlistItem } from "@/db/schema";
import type { WatchlistSummary } from "@/features/watchlists/list/query.server";
import type { WatchlistDetailPage } from "@/models/watchlist";
import { optimisticallyReorderWatchlistItems, restoreWatchlistDetailSnapshot } from "./cache";
import { watchlistDetailQueryKey } from "./query";

describe("watchlist detail reorder cache", () => {
  it("optimistically reorders only the active visible query result and restores on rollback", async () => {
    const queryClient = new QueryClient();
    const activeFilters = {
      watchlistId: 1,
      itemOrderMode: "custom" as const,
      unwatchedOnly: true,
      query: "",
    };
    const inactiveFilters = {
      watchlistId: 1,
      itemOrderMode: "custom" as const,
      unwatchedOnly: false,
      query: "alpha",
    };

    const activeKey = watchlistDetailQueryKey(activeFilters);
    const inactiveKey = watchlistDetailQueryKey(inactiveFilters);

    queryClient.setQueryData(
      activeKey,
      createDetailData([
        createPage({
          itemOrderMode: "custom",
          items: [
            createItem({ id: 1, title: "First", customRank: 1 }),
            createItem({ id: 2, title: "Second", customRank: 2 }),
            createItem({ id: 3, title: "Third", customRank: 3 }),
          ],
        }),
      ]),
    );
    queryClient.setQueryData(
      inactiveKey,
      createDetailData([
        createPage({
          itemOrderMode: "custom",
          items: [
            createItem({ id: 2, title: "Second", customRank: 2 }),
            createItem({ id: 3, title: "Third", customRank: 3 }),
          ],
        }),
      ]),
    );

    const snapshot = await optimisticallyReorderWatchlistItems({
      queryClient,
      watchlistId: 1,
      activeQueryKey: activeKey,
      movedItemId: 1,
      referenceItemId: 3,
      position: "after",
    });

    expect(
      queryClient
        .getQueryData<InfiniteData<WatchlistDetailPage, number>>(activeKey)
        ?.pages[0]?.items.map((item) => item.title),
    ).toEqual(["Second", "Third", "First"]);
    expect(
      queryClient
        .getQueryData<InfiniteData<WatchlistDetailPage, number>>(inactiveKey)
        ?.pages[0]?.items.map((item) => item.title),
    ).toEqual(["Second", "Third"]);

    restoreWatchlistDetailSnapshot({ queryClient, snapshot });

    expect(
      queryClient
        .getQueryData<InfiniteData<WatchlistDetailPage, number>>(activeKey)
        ?.pages[0]?.items.map((item) => item.title),
    ).toEqual(["First", "Second", "Third"]);
  });
});

function createDetailData(pages: WatchlistDetailPage[]): InfiniteData<WatchlistDetailPage, number> {
  return {
    pages,
    pageParams: pages.map((_, index) => index + 1),
  };
}

function createPage({
  itemOrderMode,
  items,
}: {
  itemOrderMode: WatchlistSummary["itemOrderMode"];
  items: WatchlistItem[];
}): WatchlistDetailPage {
  return {
    watchlist: {
      id: 1,
      name: "Watchlist",
      description: null,
      itemOrderMode,
      createdAt: "2024-01-01 00:00:00",
      updatedAt: null,
      lastWatchedAt: null,
      lastItemAddedAt: null,
      stats: {
        totalItems: items.length,
        watchedItems: 0,
        progress: 0,
        nextUnwatched: null,
        coverImage: null,
        coverMediaType: null,
      },
    },
    items,
  };
}

function createItem({
  id,
  title,
  customRank,
}: {
  id: number;
  title: string;
  customRank: number | null;
}): WatchlistItem {
  return {
    id,
    watchlistId: 1,
    tmdbId: String(id),
    source: "tmdb",
    mediaType: "movie",
    title,
    parentTitle: null,
    season: null,
    episode: null,
    posterPath: null,
    releaseDate: null,
    voteAverage: null,
    runtime: null,
    customRank,
    isWatched: false,
    addedAt: "2024-01-01 00:00:00",
  };
}
