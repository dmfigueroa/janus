import { describe, expect, it } from "vitest";
import type { InfiniteData } from "@tanstack/react-query";
import type { WatchlistItem } from "@/db/schema";
import type { WatchlistSummary } from "@/features/watchlists/list/query.server";
import type { WatchlistDetailPage } from "@/models/watchlist";
import {
  updateWatchlistDetailPagesAfterItemOrderMode,
  updateWatchlistDetailPagesAfterReorder,
  updateWatchlistDetailPagesAfterToggle,
} from "./transform";

describe("watchlist detail page transforms", () => {
  it("updates watched stats and removes newly watched items from unwatched-only pages", () => {
    const data = createDetailData({
      pages: [
        createPage({
          totalItems: 2,
          watchedItems: 1,
          items: [createItem({ id: 1, title: "First", isWatched: false })],
        }),
      ],
    });

    const nextData = updateWatchlistDetailPagesAfterToggle({
      data,
      itemId: 1,
      previousIsWatched: false,
      nextIsWatched: true,
      removeWatchedFromUnwatchedOnly: true,
    });

    expect(nextData?.pages[0]?.watchlist.stats.watchedItems).toBe(2);
    expect(nextData?.pages[0]?.watchlist.stats.progress).toBe(100);
    expect(nextData?.pages[0]?.items).toEqual([]);
  });

  it("updates item order mode and keeps the existing page sizes after sorting", () => {
    const data = createDetailData({
      pages: [
        createPage({
          items: [
            createItem({ id: 2, title: "March", releaseDate: "2024-03-01" }),
            createItem({ id: 1, title: "January", releaseDate: "2024-01-01" }),
          ],
        }),
        createPage({
          items: [createItem({ id: 3, title: "February", releaseDate: "2024-02-01" })],
        }),
      ],
    });

    const nextData = updateWatchlistDetailPagesAfterItemOrderMode({
      data,
      nextItemOrderMode: "release",
    });

    expect(nextData?.pages.map((page) => page.watchlist.itemOrderMode)).toEqual([
      "release",
      "release",
    ]);
    expect(nextData?.pages.map((page) => page.items.map((item) => item.title))).toEqual([
      ["January", "February"],
      ["March"],
    ]);
  });

  it("reorders the active visible items around an anchor and preserves page sizes", () => {
    const data = createDetailData({
      pages: [
        createPage({
          itemOrderMode: "custom",
          items: [
            createItem({ id: 1, title: "First", customRank: 1 }),
            createItem({ id: 2, title: "Second", customRank: 2 }),
          ],
        }),
        createPage({
          itemOrderMode: "custom",
          items: [createItem({ id: 3, title: "Third", customRank: 3 })],
        }),
      ],
    });

    const nextData = updateWatchlistDetailPagesAfterReorder({
      data,
      movedItemId: 1,
      referenceItemId: 3,
      position: "after",
    });

    expect(nextData?.pages.map((page) => page.items.map((item) => item.title))).toEqual([
      ["Second", "Third"],
      ["First"],
    ]);
    expect(nextData?.pages.flatMap((page) => page.items).map((item) => item.customRank)).toEqual([
      1, 2, 3,
    ]);
  });
});

function createDetailData({
  pages,
}: {
  pages: WatchlistDetailPage[];
}): InfiniteData<WatchlistDetailPage, number> {
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
  return {
    watchlist: createWatchlist({
      itemOrderMode,
      totalItems: totalItems ?? items.length,
      watchedItems,
    }),
    items,
  };
}

function createWatchlist({
  itemOrderMode,
  totalItems,
  watchedItems,
}: {
  itemOrderMode: WatchlistSummary["itemOrderMode"];
  totalItems: number;
  watchedItems: number;
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
    stats: {
      totalItems,
      watchedItems,
      progress: totalItems === 0 ? 0 : Math.round((watchedItems / totalItems) * 100),
      nextUnwatched: null,
      coverImage: null,
      coverMediaType: null,
    },
  };
}

function createItem({
  id,
  title,
  releaseDate = null,
  customRank = null,
  isWatched = false,
}: {
  id: number;
  title: string;
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
