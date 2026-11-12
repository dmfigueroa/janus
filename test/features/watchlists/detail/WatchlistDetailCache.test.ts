import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { WatchlistItem } from "@/db/Schema";
import type { WatchlistDetailPage } from "@/features/watchlists/detail/Query";
import {
  optimisticallyRemoveWatchlistItem,
  optimisticallyRemoveWatchlistParent,
  optimisticallyReorderWatchlistItems,
  optimisticallyToggleWatchedItem,
  restoreWatchlistDetailSnapshot,
} from "@/features/watchlists/detail/WatchlistDetailCache";
import { watchlistDetailQueryKey } from "@/features/watchlists/detail/Query";
import type { WatchlistSummary } from "@/features/watchlists/list/Query.server";

describe("watchlist detail optimistic cache", () => {
  it("toggles a watched item across every cached detail query and recomputes nextUnwatched", async () => {
    const queryClient = new QueryClient();
    const unfilteredKey = detailKey({ unwatchedOnly: false });
    const unwatchedOnlyKey = detailKey({ unwatchedOnly: true });
    const searchKey = detailKey({ query: "Queue", unwatchedOnly: false });
    const items = [
      createItem({ id: 1, title: "First", releaseDate: "2024-01-01" }),
      createItem({ id: 2, title: "Second", releaseDate: "2024-02-01" }),
      createItem({ id: 3, title: "Watched", releaseDate: "2024-03-01", isWatched: true }),
    ];

    seedDetail(queryClient, unfilteredKey, {
      totalItems: 3,
      watchedItems: 1,
      items,
    });
    seedDetail(queryClient, unwatchedOnlyKey, {
      totalItems: 3,
      watchedItems: 1,
      items: items.slice(0, 2),
    });
    seedDetail(queryClient, searchKey, {
      totalItems: 3,
      watchedItems: 1,
      items: items.slice(0, 2),
    });

    const snapshot = await optimisticallyToggleWatchedItem({
      queryClient,
      watchlistId: 1,
      itemId: 1,
      previousIsWatched: false,
      nextIsWatched: true,
    });

    expect(readItems(queryClient, unfilteredKey)).toEqual([
      expect.objectContaining({ id: 1, isWatched: true }),
      expect.objectContaining({ id: 2 }),
      expect.objectContaining({ id: 3 }),
    ]);
    expect(readItems(queryClient, unwatchedOnlyKey)).toEqual([expect.objectContaining({ id: 2 })]);
    expect(readItems(queryClient, searchKey)).toEqual([
      expect.objectContaining({ id: 1, isWatched: true }),
      expect.objectContaining({ id: 2 }),
    ]);
    expect(readStats(queryClient, unfilteredKey)).toMatchObject({
      totalItems: 3,
      watchedItems: 2,
      progress: 67,
      nextUnwatched: expect.objectContaining({ id: 2 }),
    });
    expect(readStats(queryClient, unwatchedOnlyKey)).toMatchObject({
      watchedItems: 2,
      nextUnwatched: expect.objectContaining({ id: 2 }),
    });
    expect(readStats(queryClient, searchKey)).toMatchObject({
      watchedItems: 2,
      nextUnwatched: expect.objectContaining({ id: 2 }),
    });

    restoreWatchlistDetailSnapshot({ queryClient, snapshot });

    expect(readItems(queryClient, unwatchedOnlyKey)).toEqual([
      expect.objectContaining({ id: 1, isWatched: false }),
      expect.objectContaining({ id: 2 }),
    ]);
    expect(readItems(queryClient, searchKey)).toEqual([
      expect.objectContaining({ id: 1, isWatched: false }),
      expect.objectContaining({ id: 2 }),
    ]);
    expect(readStats(queryClient, unfilteredKey)).toMatchObject({
      watchedItems: 1,
      progress: 33,
      nextUnwatched: expect.objectContaining({ id: 1 }),
    });
    expect(readStats(queryClient, searchKey)).toMatchObject({
      watchedItems: 1,
      nextUnwatched: expect.objectContaining({ id: 1 }),
    });
  });

  it("removes one item from every cached detail query and advances nextUnwatched", async () => {
    const queryClient = new QueryClient();
    const unfilteredKey = detailKey({ unwatchedOnly: false });
    const unwatchedOnlyKey = detailKey({ unwatchedOnly: true });
    const searchKey = detailKey({ query: "Second", unwatchedOnly: false });
    const items = [
      createItem({ id: 1, title: "First", releaseDate: "2024-01-01" }),
      createItem({ id: 2, title: "Second", releaseDate: "2024-02-01" }),
      createItem({ id: 3, title: "Watched", releaseDate: "2024-03-01", isWatched: true }),
    ];

    seedDetail(queryClient, unfilteredKey, { totalItems: 3, watchedItems: 1, items });
    seedDetail(queryClient, unwatchedOnlyKey, {
      totalItems: 3,
      watchedItems: 1,
      items: items.slice(0, 2),
    });
    seedDetail(queryClient, searchKey, {
      totalItems: 3,
      watchedItems: 1,
      items: items.slice(1),
    });

    const snapshot = await optimisticallyRemoveWatchlistItem({
      queryClient,
      watchlistId: 1,
      itemId: 1,
      removedCount: 1,
      watchedCount: 0,
    });

    expect(readItems(queryClient, unfilteredKey).map((item) => item.id)).toEqual([2, 3]);
    expect(readItems(queryClient, unwatchedOnlyKey).map((item) => item.id)).toEqual([2]);
    expect(readItems(queryClient, searchKey).map((item) => item.id)).toEqual([2, 3]);

    for (const cacheKey of [unfilteredKey, unwatchedOnlyKey, searchKey]) {
      expect(readStats(queryClient, cacheKey)).toMatchObject({
        totalItems: 2,
        watchedItems: 1,
        progress: 50,
        nextUnwatched: expect.objectContaining({ id: 2 }),
      });
    }

    restoreWatchlistDetailSnapshot({ queryClient, snapshot });

    expect(readItems(queryClient, unfilteredKey).map((item) => item.id)).toEqual([1, 2, 3]);
    expect(readItems(queryClient, searchKey).map((item) => item.id)).toEqual([2, 3]);
    expect(readStats(queryClient, unfilteredKey)).toMatchObject({
      totalItems: 3,
      watchedItems: 1,
      nextUnwatched: expect.objectContaining({ id: 1 }),
    });
  });

  it("removes a parent group from every cached detail query using preview counts", async () => {
    const queryClient = new QueryClient();
    const unfilteredKey = detailKey({ unwatchedOnly: false });
    const unwatchedOnlyKey = detailKey({ unwatchedOnly: true });
    const searchKey = detailKey({ query: "Standalone" });
    const items = [
      createItem({
        id: 1,
        title: "Pilot",
        parentId: "tmdb:42",
        releaseDate: "2024-01-01",
        isWatched: true,
      }),
      createItem({ id: 2, title: "Second", parentId: "tmdb:42", releaseDate: "2024-02-01" }),
      createItem({ id: 3, title: "Standalone", releaseDate: "2024-03-01" }),
    ];

    seedDetail(queryClient, unfilteredKey, { totalItems: 3, watchedItems: 1, items });
    seedDetail(queryClient, unwatchedOnlyKey, {
      totalItems: 3,
      watchedItems: 1,
      items: items.slice(1),
    });
    seedDetail(queryClient, searchKey, {
      totalItems: 3,
      watchedItems: 1,
      items: [items[2]!],
    });

    const snapshot = await optimisticallyRemoveWatchlistParent({
      queryClient,
      watchlistId: 1,
      parentId: "tmdb:42",
      removedCount: 2,
      watchedCount: 1,
    });

    for (const cacheKey of [unfilteredKey, unwatchedOnlyKey, searchKey]) {
      expect(readItems(queryClient, cacheKey).map((item) => item.id)).toEqual([3]);
      expect(readStats(queryClient, cacheKey)).toMatchObject({
        totalItems: 1,
        watchedItems: 0,
        progress: 0,
        nextUnwatched: expect.objectContaining({ id: 3 }),
      });
    }

    restoreWatchlistDetailSnapshot({ queryClient, snapshot });

    expect(readItems(queryClient, unfilteredKey).map((item) => item.id)).toEqual([1, 2, 3]);
    expect(readItems(queryClient, searchKey).map((item) => item.id)).toEqual([3]);
    expect(readStats(queryClient, unfilteredKey)).toMatchObject({
      totalItems: 3,
      watchedItems: 1,
      nextUnwatched: expect.objectContaining({ id: 2 }),
    });
  });

  it("reorders only the active visible query result and restores on rollback", async () => {
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

    seedDetail(queryClient, activeKey, {
      itemOrderMode: "custom",
      items: [
        createItem({ id: 1, title: "First", customRank: 1 }),
        createItem({ id: 2, title: "Second", customRank: 2 }),
        createItem({ id: 3, title: "Third", customRank: 3 }),
      ],
    });
    seedDetail(queryClient, inactiveKey, {
      itemOrderMode: "custom",
      items: [
        createItem({ id: 2, title: "Second", customRank: 2 }),
        createItem({ id: 3, title: "Third", customRank: 3 }),
      ],
    });

    const snapshot = await optimisticallyReorderWatchlistItems({
      queryClient,
      watchlistId: 1,
      activeQueryKey: activeKey,
      movedItemId: 1,
      referenceItemId: 3,
      position: "after",
    });

    expect(readItems(queryClient, activeKey).map((item) => item.title)).toEqual([
      "Second",
      "Third",
      "First",
    ]);
    expect(readItems(queryClient, inactiveKey).map((item) => item.title)).toEqual([
      "Second",
      "Third",
    ]);

    restoreWatchlistDetailSnapshot({ queryClient, snapshot });

    expect(readItems(queryClient, activeKey).map((item) => item.title)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
  });
});

function detailKey(overrides: {
  query?: string;
  unwatchedOnly?: boolean;
  itemOrderMode?: "release" | "custom";
}) {
  return watchlistDetailQueryKey({
    watchlistId: 1,
    itemOrderMode: overrides.itemOrderMode ?? "release",
    query: overrides.query ?? "",
    unwatchedOnly: overrides.unwatchedOnly ?? false,
  });
}

function seedDetail(
  queryClient: QueryClient,
  cacheKey: ReturnType<typeof watchlistDetailQueryKey>,
  {
    itemOrderMode = "release",
    totalItems,
    watchedItems,
    items,
  }: {
    itemOrderMode?: WatchlistSummary["itemOrderMode"];
    totalItems?: number;
    watchedItems?: number;
    items: WatchlistItem[];
  },
) {
  const nextTotalItems = totalItems ?? items.length;
  const nextWatchedItems = watchedItems ?? items.filter((item) => item.isWatched).length;

  queryClient.setQueryData(cacheKey, {
    pages: [
      {
        watchlist: createWatchlist({
          itemOrderMode,
          totalItems: nextTotalItems,
          watchedItems: nextWatchedItems,
          nextUnwatched: items.find((item) => !item.isWatched) ?? null,
        }),
        items,
      },
    ],
    pageParams: [1],
  } satisfies InfiniteData<WatchlistDetailPage, number>);
}

function readItems(queryClient: QueryClient, cacheKey: ReturnType<typeof watchlistDetailQueryKey>) {
  return (
    queryClient
      .getQueryData<InfiniteData<WatchlistDetailPage, number>>(cacheKey)
      ?.pages.flatMap((page) => page.items) ?? []
  );
}

function readStats(queryClient: QueryClient, cacheKey: ReturnType<typeof watchlistDetailQueryKey>) {
  return queryClient.getQueryData<InfiniteData<WatchlistDetailPage, number>>(cacheKey)?.pages[0]
    ?.watchlist.stats;
}

function createWatchlist({
  itemOrderMode,
  totalItems,
  watchedItems,
  nextUnwatched,
}: {
  itemOrderMode: WatchlistSummary["itemOrderMode"];
  totalItems: number;
  watchedItems: number;
  nextUnwatched: WatchlistItem | null;
}): WatchlistSummary {
  return {
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
      totalItems,
      watchedItems,
      progress: totalItems === 0 ? 0 : Math.round((watchedItems / totalItems) * 100),
      nextUnwatched,
      coverImage: null,
      coverMediaType: null,
    },
  };
}

function createItem({
  id,
  title,
  parentId = null,
  releaseDate = null,
  customRank = null,
  isWatched = false,
}: {
  id: number;
  title: string;
  parentId?: string | null;
  releaseDate?: string | null;
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
    releaseDate,
    voteAverage: null,
    runtime: null,
    customRank,
    isWatched,
    authors: null,
    addedAt: "2024-01-01 00:00:00",
  };
}
