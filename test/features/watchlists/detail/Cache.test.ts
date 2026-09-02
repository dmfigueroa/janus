import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { WatchlistItem } from "@/db/Schema";
import type { WatchlistSummary } from "@/features/watchlists/list/Query.server";
import type { WatchlistDetailPage } from "@/features/watchlists/detail/Query";
import {
  optimisticallyRemoveWatchlistItem,
  optimisticallyRemoveWatchlistParent,
  optimisticallyReorderWatchlistItems,
  restoreWatchlistDetailSnapshot,
} from "@/features/watchlists/detail/Cache";
import { watchlistDetailQueryKey } from "@/features/watchlists/detail/Query";

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

  it("optimistically removes only the active visible item result and restores on rollback", async () => {
    const queryClient = new QueryClient();
    const activeKey = watchlistDetailQueryKey({
      watchlistId: 1,
      itemOrderMode: "release",
      unwatchedOnly: false,
      query: "",
    });
    const inactiveKey = watchlistDetailQueryKey({
      watchlistId: 1,
      itemOrderMode: "release",
      unwatchedOnly: true,
      query: "",
    });

    queryClient.setQueryData(
      activeKey,
      createDetailData([
        createPage({
          totalItems: 2,
          watchedItems: 1,
          items: [
            createItem({ id: 1, title: "Remove Me", isWatched: true }),
            createItem({ id: 2, title: "Keep Me" }),
          ],
        }),
      ]),
    );
    queryClient.setQueryData(
      inactiveKey,
      createDetailData([
        createPage({
          totalItems: 1,
          watchedItems: 0,
          items: [createItem({ id: 2, title: "Keep Me" })],
        }),
      ]),
    );

    const snapshot = await optimisticallyRemoveWatchlistItem({
      queryClient,
      watchlistId: 1,
      activeQueryKey: activeKey,
      itemId: 1,
      removedCount: 1,
      watchedCount: 1,
    });

    expect(
      queryClient.getQueryData<InfiniteData<WatchlistDetailPage, number>>(activeKey)?.pages[0]
        ?.items,
    ).toEqual([expect.objectContaining({ title: "Keep Me" })]);
    expect(
      queryClient.getQueryData<InfiniteData<WatchlistDetailPage, number>>(activeKey)?.pages[0]
        ?.watchlist.stats,
    ).toMatchObject({ totalItems: 1, watchedItems: 0, progress: 0 });
    expect(
      queryClient
        .getQueryData<InfiniteData<WatchlistDetailPage, number>>(inactiveKey)
        ?.pages[0]?.items.map((item) => item.title),
    ).toEqual(["Keep Me"]);

    restoreWatchlistDetailSnapshot({ queryClient, snapshot });

    expect(
      queryClient
        .getQueryData<InfiniteData<WatchlistDetailPage, number>>(activeKey)
        ?.pages[0]?.items.map((item) => item.title),
    ).toEqual(["Remove Me", "Keep Me"]);
  });

  it("optimistically removes visible parent rows only from the active query and restores on rollback", async () => {
    const queryClient = new QueryClient();
    const activeKey = watchlistDetailQueryKey({
      watchlistId: 1,
      itemOrderMode: "release",
      unwatchedOnly: false,
      query: "show",
    });
    const inactiveKey = watchlistDetailQueryKey({
      watchlistId: 1,
      itemOrderMode: "release",
      unwatchedOnly: false,
      query: "",
    });

    queryClient.setQueryData(
      activeKey,
      createDetailData([
        createPage({
          totalItems: 4,
          watchedItems: 2,
          items: [
            createItem({ id: 1, title: "Pilot", parentId: "tmdb:42", isWatched: true }),
            createItem({ id: 2, title: "Second", parentId: "tmdb:42" }),
            createItem({ id: 3, title: "Standalone" }),
          ],
        }),
      ]),
    );
    queryClient.setQueryData(
      inactiveKey,
      createDetailData([
        createPage({
          totalItems: 4,
          watchedItems: 2,
          items: [
            createItem({ id: 1, title: "Pilot", parentId: "tmdb:42", isWatched: true }),
            createItem({ id: 2, title: "Second", parentId: "tmdb:42" }),
            createItem({ id: 3, title: "Standalone" }),
          ],
        }),
      ]),
    );

    const snapshot = await optimisticallyRemoveWatchlistParent({
      queryClient,
      watchlistId: 1,
      activeQueryKey: activeKey,
      parentId: "tmdb:42",
      removedCount: 3,
      watchedCount: 2,
    });

    expect(
      queryClient
        .getQueryData<InfiniteData<WatchlistDetailPage, number>>(activeKey)
        ?.pages[0]?.items.map((item) => item.title),
    ).toEqual(["Standalone"]);
    expect(
      queryClient
        .getQueryData<InfiniteData<WatchlistDetailPage, number>>(inactiveKey)
        ?.pages[0]?.items.map((item) => item.title),
    ).toEqual(["Pilot", "Second", "Standalone"]);

    restoreWatchlistDetailSnapshot({ queryClient, snapshot });

    expect(
      queryClient
        .getQueryData<InfiniteData<WatchlistDetailPage, number>>(activeKey)
        ?.pages[0]?.items.map((item) => item.title),
    ).toEqual(["Pilot", "Second", "Standalone"]);
  });
});

function createDetailData(pages: WatchlistDetailPage[]): InfiniteData<WatchlistDetailPage, number> {
  return {
    pages,
    pageParams: pages.map((_, index) => index + 1),
  };
}

function createPage({
  itemOrderMode = "release",
  totalItems,
  watchedItems = 0,
  items,
}: {
  itemOrderMode?: WatchlistSummary["itemOrderMode"];
  totalItems?: number;
  watchedItems?: number;
  items: WatchlistItem[];
}): WatchlistDetailPage {
  const nextTotalItems = totalItems ?? items.length;

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
      pausedAt: null,
      stats: {
        totalItems: nextTotalItems,
        watchedItems,
        progress: nextTotalItems ? Math.round((watchedItems / nextTotalItems) * 100) : 0,
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
  parentId = null,
  customRank = null,
  isWatched = false,
}: {
  id: number;
  title: string;
  parentId?: string | null;
  customRank?: number | null;
  isWatched?: boolean;
}): WatchlistItem {
  return {
    id,
    watchlistId: 1,
    tmdbId: String(id),
    source: "tmdb",
    mediaType: "movie",
    title,
    parentId,
    parentTitle: null,
    season: null,
    episode: null,
    posterPath: null,
    releaseDate: null,
    voteAverage: null,
    runtime: null,
    customRank,
    isWatched,
    authors: null,
    addedAt: "2024-01-01 00:00:00",
  };
}
