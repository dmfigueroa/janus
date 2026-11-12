import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import * as schema from "@/db/Schema";
import { createIsolatedTestDb, type IsolatedTestDb } from "@test/IsolatedDb";
import { watchlistListQueryKey } from "@/features/watchlists/list/Query";

const dbState = vi.hoisted(() => ({
  db: undefined as IsolatedTestDb | undefined,
}));

vi.mock("@/db/Db.server", () => ({
  getDb: () => dbState.db,
}));

let testDb: Awaited<ReturnType<typeof createIsolatedTestDb>>;
let db: IsolatedTestDb;
const { watchlists, watchlistItems } = schema;
let getWatchlistDetail: typeof import("@/features/watchlists/detail/Query.server").getWatchlistDetail;
let readWatchlistDetailScreen: typeof import("@/features/watchlists/Read.server").WatchlistsRead.detailScreen;
let invalidateWatchlistQueries: typeof import("@/features/watchlists/Cache").invalidateWatchlistQueries;
let optimisticallyToggleWatchedItem: typeof import("@/features/watchlists/detail/WatchlistDetailCache").optimisticallyToggleWatchedItem;
let restoreWatchlistDetailSnapshot: typeof import("@/features/watchlists/detail/WatchlistDetailCache").restoreWatchlistDetailSnapshot;
let watchlistDetailInfiniteQueryOptions: typeof import("@/features/watchlists/detail/Query").watchlistDetailInfiniteQueryOptions;
let watchlistDetailQueryKey: typeof import("@/features/watchlists/detail/Query").watchlistDetailQueryKey;
type WatchlistDetailQueryFilters =
  import("@/features/watchlists/detail/Query").WatchlistDetailQueryFilters;
type WatchlistDetailQueryData =
  import("@/features/watchlists/detail/Query").WatchlistDetailQueryData;

beforeAll(async () => {
  testDb = await createIsolatedTestDb();
  db = testDb.db;
  dbState.db = db;

  const queryModule = await import("@/features/watchlists/detail/Query");
  const cacheModule = await import("@/features/watchlists/Cache");
  const detailCacheModule = await import("@/features/watchlists/detail/WatchlistDetailCache");
  const queryServerModule = await import("@/features/watchlists/detail/Query.server");
  const readModule = await import("@/features/watchlists/Read.server");
  getWatchlistDetail = queryServerModule.getWatchlistDetail;
  readWatchlistDetailScreen = readModule.WatchlistsRead.detailScreen;
  invalidateWatchlistQueries = cacheModule.invalidateWatchlistQueries;
  optimisticallyToggleWatchedItem = detailCacheModule.optimisticallyToggleWatchedItem;
  restoreWatchlistDetailSnapshot = detailCacheModule.restoreWatchlistDetailSnapshot;
  watchlistDetailInfiniteQueryOptions = queryModule.watchlistDetailInfiniteQueryOptions;
  watchlistDetailQueryKey = queryModule.watchlistDetailQueryKey;
});

afterAll(() => {
  testDb.close();
});

beforeEach(async () => {
  await db.delete(watchlistItems);
  await db.delete(watchlists);
});

async function seedRouteLoadedDetail({
  queryClient,
  filters,
}: {
  queryClient: QueryClient;
  filters: WatchlistDetailQueryFilters;
}) {
  const detail = await readWatchlistDetailScreen({ ...filters, cursor: 1 });

  if (!detail) {
    return null;
  }

  queryClient.setQueryData(watchlistDetailQueryKey(filters), {
    pages: [detail],
    pageParams: [1],
  });

  return detail;
}

describe("watchlist detail query contract", () => {
  it("returns release item order mode by default from the direct detail read function", async () => {
    const [watchlist] = await db.insert(watchlists).values({ name: "Default Mode" }).returning();

    const detail = await getWatchlistDetail({ watchlistId: watchlist.id });

    expect(detail?.watchlist.itemOrderMode).toBe("release");
  });

  it("returns a persisted custom item order mode from the direct detail read function", async () => {
    const [watchlist] = await db
      .insert(watchlists)
      .values({ name: "Custom Mode", itemOrderMode: "custom" })
      .returning();

    const detail = await getWatchlistDetail({ watchlistId: watchlist.id });

    expect(detail?.watchlist.itemOrderMode).toBe("custom");
  });

  it("falls back to release ordering when custom mode has no manual arrangement", async () => {
    const [watchlist] = await db
      .insert(watchlists)
      .values({ name: "Custom Without Ranks", itemOrderMode: "custom" })
      .returning();

    await db.insert(watchlistItems).values([
      {
        watchlistId: watchlist.id,
        tmdbId: "march",
        source: "tmdb",
        mediaType: "movie",
        title: "March Release",
        releaseDate: "2024-03-01",
      },
      {
        watchlistId: watchlist.id,
        tmdbId: "january",
        source: "tmdb",
        mediaType: "movie",
        title: "January Release",
        releaseDate: "2024-01-01",
      },
      {
        watchlistId: watchlist.id,
        tmdbId: "february",
        source: "tmdb",
        mediaType: "movie",
        title: "February Release",
        releaseDate: "2024-02-01",
      },
    ]);

    const detail = await getWatchlistDetail({ watchlistId: watchlist.id });

    expect(detail?.watchlist.itemOrderMode).toBe("custom");
    expect(detail?.items.map((item) => item.title)).toEqual([
      "January Release",
      "February Release",
      "March Release",
    ]);
  });

  it("returns items in persisted custom rank order when custom mode is active", async () => {
    const [watchlist] = await db
      .insert(watchlists)
      .values({ name: "Custom Ranked", itemOrderMode: "custom" })
      .returning();

    await db.insert(watchlistItems).values([
      {
        watchlistId: watchlist.id,
        tmdbId: "third",
        source: "tmdb",
        mediaType: "movie",
        title: "Third Pick",
        releaseDate: "2024-01-01",
        customRank: 3,
      },
      {
        watchlistId: watchlist.id,
        tmdbId: "first",
        source: "tmdb",
        mediaType: "movie",
        title: "First Pick",
        releaseDate: "2024-03-01",
        customRank: 1,
      },
      {
        watchlistId: watchlist.id,
        tmdbId: "second",
        source: "tmdb",
        mediaType: "movie",
        title: "Second Pick",
        releaseDate: "2024-02-01",
        customRank: 2,
      },
    ]);

    const detail = await readWatchlistDetailScreen({ watchlistId: watchlist.id });

    expect(detail?.watchlist.itemOrderMode).toBe("custom");
    expect(detail?.items.map((item) => item.title)).toEqual([
      "First Pick",
      "Second Pick",
      "Third Pick",
    ]);
  });

  it("keeps pagination in stable custom rank order when custom mode is active", async () => {
    const [watchlist] = await db
      .insert(watchlists)
      .values({ name: "Custom Ranked Pages", itemOrderMode: "custom" })
      .returning();

    await db.insert(watchlistItems).values([
      {
        watchlistId: watchlist.id,
        tmdbId: "fourth",
        source: "tmdb",
        mediaType: "movie",
        title: "Fourth Pick",
        releaseDate: "2024-01-01",
        customRank: 4,
      },
      {
        watchlistId: watchlist.id,
        tmdbId: "second-page-first",
        source: "tmdb",
        mediaType: "movie",
        title: "Third Pick",
        releaseDate: "2024-02-01",
        customRank: 3,
      },
      {
        watchlistId: watchlist.id,
        tmdbId: "first-page-second",
        source: "tmdb",
        mediaType: "movie",
        title: "Second Pick",
        releaseDate: "2024-03-01",
        customRank: 2,
      },
      {
        watchlistId: watchlist.id,
        tmdbId: "first-page-first",
        source: "tmdb",
        mediaType: "movie",
        title: "First Pick",
        releaseDate: "2024-04-01",
        customRank: 1,
      },
    ]);

    const firstPage = await readWatchlistDetailScreen({
      watchlistId: watchlist.id,
      pageSize: 2,
      cursor: 1,
    });
    const secondPage = await readWatchlistDetailScreen({
      watchlistId: watchlist.id,
      pageSize: 2,
      cursor: 2,
    });

    expect(firstPage?.items.map((item) => item.title)).toEqual(["First Pick", "Second Pick"]);
    expect(firstPage?.nextCursor).toBe(2);
    expect(secondPage?.items.map((item) => item.title)).toEqual(["Third Pick", "Fourth Pick"]);
    expect(secondPage?.nextCursor).toBeUndefined();
  });

  it("preserves relative custom rank order in search results", async () => {
    const [watchlist] = await db
      .insert(watchlists)
      .values({ name: "Custom Ranked Search", itemOrderMode: "custom" })
      .returning();

    await db.insert(watchlistItems).values([
      {
        watchlistId: watchlist.id,
        tmdbId: "search-third",
        source: "tmdb",
        mediaType: "movie",
        title: "Alpha Finale",
        releaseDate: "2024-01-01",
        customRank: 3,
      },
      {
        watchlistId: watchlist.id,
        tmdbId: "search-first",
        source: "tmdb",
        mediaType: "movie",
        title: "Alpha Origin",
        releaseDate: "2024-03-01",
        customRank: 1,
      },
      {
        watchlistId: watchlist.id,
        tmdbId: "search-second",
        source: "tmdb",
        mediaType: "movie",
        title: "Alpha Rising",
        releaseDate: "2024-02-01",
        customRank: 2,
      },
      {
        watchlistId: watchlist.id,
        tmdbId: "non-match",
        source: "tmdb",
        mediaType: "movie",
        title: "Beta Story",
        releaseDate: "2024-04-01",
        customRank: 4,
      },
    ]);

    const detail = await readWatchlistDetailScreen({ watchlistId: watchlist.id, query: "Alpha" });

    expect(detail?.items.map((item) => item.title)).toEqual([
      "Alpha Origin",
      "Alpha Rising",
      "Alpha Finale",
    ]);
  });

  it("preserves relative custom rank order in unwatched-only results", async () => {
    const [watchlist] = await db
      .insert(watchlists)
      .values({ name: "Custom Ranked Unwatched", itemOrderMode: "custom" })
      .returning();

    await db.insert(watchlistItems).values([
      {
        watchlistId: watchlist.id,
        tmdbId: "watched-high-rank",
        source: "tmdb",
        mediaType: "movie",
        title: "Watched First",
        releaseDate: "2024-04-01",
        customRank: 1,
        isWatched: true,
      },
      {
        watchlistId: watchlist.id,
        tmdbId: "unwatched-third",
        source: "tmdb",
        mediaType: "movie",
        title: "Unwatched Third",
        releaseDate: "2024-01-01",
        customRank: 4,
        isWatched: false,
      },
      {
        watchlistId: watchlist.id,
        tmdbId: "unwatched-first",
        source: "tmdb",
        mediaType: "movie",
        title: "Unwatched First",
        releaseDate: "2024-03-01",
        customRank: 2,
        isWatched: false,
      },
      {
        watchlistId: watchlist.id,
        tmdbId: "unwatched-second",
        source: "tmdb",
        mediaType: "movie",
        title: "Unwatched Second",
        releaseDate: "2024-02-01",
        customRank: 3,
        isWatched: false,
      },
    ]);

    const detail = await readWatchlistDetailScreen({
      watchlistId: watchlist.id,
      unwatchedOnly: true,
    });

    expect(detail?.items.map((item) => item.title)).toEqual([
      "Unwatched First",
      "Unwatched Second",
      "Unwatched Third",
    ]);
  });

  it("seeds route-loaded detail data and continues pagination through the shared query contract", async () => {
    const [watchlist] = await db.insert(watchlists).values({ name: "Paged Detail" }).returning();

    await db.insert(watchlistItems).values([
      {
        watchlistId: watchlist.id,
        tmdbId: "watched",
        source: "tmdb",
        mediaType: "movie",
        title: "Watched First",
        releaseDate: "2024-01-01",
        isWatched: true,
      },
      {
        watchlistId: watchlist.id,
        tmdbId: "next",
        source: "tmdb",
        mediaType: "movie",
        title: "Next Up",
        releaseDate: "2024-02-01",
        isWatched: false,
      },
      {
        watchlistId: watchlist.id,
        tmdbId: "later",
        source: "tmdb",
        mediaType: "movie",
        title: "Later",
        releaseDate: "2024-03-01",
        isWatched: false,
      },
    ]);

    const queryClient = new QueryClient();
    const filters = { watchlistId: watchlist.id, unwatchedOnly: true, pageSize: 1 };

    const initialPage = await seedRouteLoadedDetail({ queryClient, filters });

    expect(initialPage?.items.map((item) => item.title)).toEqual(["Next Up"]);

    const queryKey = watchlistDetailQueryKey(filters);
    const options = watchlistDetailInfiniteQueryOptions(filters);
    const seededData =
      queryClient.getQueryData<InfiniteData<WatchlistDetailQueryData, number>>(queryKey);

    expect(options.queryKey).toEqual(queryKey);
    expect(initialPage?.nextCursor).toBe(2);
    expect(seededData?.pages).toHaveLength(1);
    expect(seededData?.pages[0]?.items.map((item) => item.title)).toEqual(["Next Up"]);

    expect(seededData?.pages[0]?.watchlist.stats).toMatchObject({
      totalItems: 3,
      watchedItems: 1,
      progress: 33,
    });
  });

  it("keeps filtered cache entries isolated while preserving derived watchlist stats", async () => {
    const [watchlist] = await db.insert(watchlists).values({ name: "Filtered Detail" }).returning();

    await db.insert(watchlistItems).values([
      {
        watchlistId: watchlist.id,
        tmdbId: "comic-1",
        source: "comicvine",
        mediaType: "comic",
        title: "Issue One",
        parentTitle: "Saga",
        episode: "1",
        releaseDate: "2024-01-01",
        isWatched: false,
      },
      {
        watchlistId: watchlist.id,
        tmdbId: "movie-1",
        source: "tmdb",
        mediaType: "movie",
        title: "Inception",
        releaseDate: "2024-02-01",
        isWatched: true,
      },
      {
        watchlistId: watchlist.id,
        tmdbId: "movie-2",
        source: "tmdb",
        mediaType: "movie",
        title: "Arrival",
        releaseDate: "2024-03-01",
        isWatched: false,
      },
    ]);

    const queryClient = new QueryClient();
    const defaultFilters = { watchlistId: watchlist.id, unwatchedOnly: true };
    const searchFilters = { watchlistId: watchlist.id, query: "Saga", unwatchedOnly: false };

    await seedRouteLoadedDetail({ queryClient, filters: defaultFilters });
    await seedRouteLoadedDetail({ queryClient, filters: searchFilters });

    const defaultKey = watchlistDetailQueryKey(defaultFilters);
    const searchKey = watchlistDetailQueryKey(searchFilters);
    const defaultData =
      queryClient.getQueryData<InfiniteData<WatchlistDetailQueryData, number>>(defaultKey);
    const searchData =
      queryClient.getQueryData<InfiniteData<WatchlistDetailQueryData, number>>(searchKey);

    expect(defaultKey).not.toEqual(searchKey);
    expect(defaultData?.pages[0]?.items.map((item) => item.title)).toEqual([
      "Issue One",
      "Arrival",
    ]);
    expect(searchData?.pages[0]?.items.map((item) => item.parentTitle)).toEqual(["Saga"]);
    expect(searchData?.pages[0]?.watchlist.stats).toMatchObject({
      totalItems: 3,
      watchedItems: 1,
      progress: 33,
    });
  });

  it("optimistically updates watched toggles across detail caches, rolls back, and invalidates watchlists", async () => {
    const [watchlist] = await db
      .insert(watchlists)
      .values({ name: "Optimistic Detail" })
      .returning();

    const [, nextUp] = await db
      .insert(watchlistItems)
      .values([
        {
          watchlistId: watchlist.id,
          tmdbId: "watched",
          source: "tmdb",
          mediaType: "movie",
          title: "Already Watched",
          releaseDate: "2024-01-01",
          isWatched: true,
        },
        {
          watchlistId: watchlist.id,
          tmdbId: "next",
          source: "tmdb",
          mediaType: "movie",
          title: "Next Up",
          releaseDate: "2024-02-01",
          isWatched: false,
        },
        {
          watchlistId: watchlist.id,
          tmdbId: "other",
          source: "tmdb",
          mediaType: "movie",
          title: "Other Pick",
          releaseDate: "2024-03-01",
          isWatched: false,
        },
      ])
      .returning();

    const queryClient = new QueryClient();
    const defaultFilters = { watchlistId: watchlist.id, unwatchedOnly: true };
    const unfilteredFilters = { watchlistId: watchlist.id, unwatchedOnly: false };
    const searchFilters = { watchlistId: watchlist.id, query: "Other", unwatchedOnly: false };
    const listKey = watchlistListQueryKey();

    await seedRouteLoadedDetail({ queryClient, filters: defaultFilters });
    await seedRouteLoadedDetail({ queryClient, filters: unfilteredFilters });
    await seedRouteLoadedDetail({ queryClient, filters: searchFilters });
    queryClient.setQueryData(listKey, []);

    const snapshot = await optimisticallyToggleWatchedItem({
      queryClient,
      watchlistId: watchlist.id,
      itemId: nextUp.id,
      previousIsWatched: false,
      nextIsWatched: true,
    });

    const defaultData = queryClient.getQueryData<InfiniteData<WatchlistDetailQueryData, number>>(
      watchlistDetailQueryKey(defaultFilters),
    );
    const unfilteredData = queryClient.getQueryData<InfiniteData<WatchlistDetailQueryData, number>>(
      watchlistDetailQueryKey(unfilteredFilters),
    );
    const searchData = queryClient.getQueryData<InfiniteData<WatchlistDetailQueryData, number>>(
      watchlistDetailQueryKey(searchFilters),
    );

    expect(defaultData?.pages[0]?.items.map((item) => item.title)).toEqual(["Other Pick"]);
    expect(unfilteredData?.pages[0]?.items.find((item) => item.id === nextUp.id)).toMatchObject({
      isWatched: true,
    });
    expect(searchData?.pages[0]?.items.map((item) => item.title)).toEqual(["Other Pick"]);
    expect(searchData?.pages[0]?.watchlist.stats).toMatchObject({
      watchedItems: 2,
      progress: 67,
    });

    restoreWatchlistDetailSnapshot({ queryClient, snapshot });

    const rolledBackDefault = queryClient.getQueryData<
      InfiniteData<WatchlistDetailQueryData, number>
    >(watchlistDetailQueryKey(defaultFilters));

    expect(rolledBackDefault?.pages[0]?.items.map((item) => item.title)).toEqual([
      "Next Up",
      "Other Pick",
    ]);
    expect(rolledBackDefault?.pages[0]?.watchlist.stats).toMatchObject({
      watchedItems: 1,
      progress: 33,
    });

    await invalidateWatchlistQueries(queryClient);

    expect(queryClient.getQueryState(watchlistDetailQueryKey(defaultFilters))?.isInvalidated).toBe(
      true,
    );
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
  });
});
