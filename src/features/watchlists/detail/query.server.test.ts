import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { watchlistListQueryKey } from "../queries";

let db: ReturnType<typeof import("@/db/db.server").getDb>;
let watchlists: typeof import("@/db/schema").watchlists;
let watchlistItems: typeof import("@/db/schema").watchlistItems;
let closeDb: typeof import("@/db/db.server").closeDb;
let getWatchlistDetail: typeof import("./query.server").getWatchlistDetail;
let readWatchlistDetailScreen: typeof import("../read.server").WatchlistsRead.detailScreen;
let invalidateWatchlistQueries: typeof import("./query").invalidateWatchlistQueries;
let optimisticallyToggleWatchedItem: typeof import("./query").optimisticallyToggleWatchedItem;
let rollbackWatchedToggle: typeof import("./query").rollbackWatchedToggle;
let watchlistDetailInfiniteQueryOptions: typeof import("./query").watchlistDetailInfiniteQueryOptions;
let watchlistDetailQueryKey: typeof import("./query").watchlistDetailQueryKey;
type WatchlistDetailQueryFilters = import("./query").WatchlistDetailQueryFilters;
type WatchlistDetailQueryData = import("./query").WatchlistDetailQueryData;

beforeAll(async () => {
  process.env.DATABASE_URL = ":memory:";

  const dbModule = await import("@/db/db.server");
  const schemaModule = await import("@/db/schema");
  const queryModule = await import("./query");
  const queryServerModule = await import("./query.server");
  const readModule = await import("../read.server");
  db = dbModule.getDb();
  closeDb = dbModule.closeDb;
  watchlists = schemaModule.watchlists;
  watchlistItems = schemaModule.watchlistItems;
  getWatchlistDetail = queryServerModule.getWatchlistDetail;
  readWatchlistDetailScreen = readModule.WatchlistsRead.detailScreen;
  invalidateWatchlistQueries = queryModule.invalidateWatchlistQueries;
  optimisticallyToggleWatchedItem = queryModule.optimisticallyToggleWatchedItem;
  rollbackWatchedToggle = queryModule.rollbackWatchedToggle;
  watchlistDetailInfiniteQueryOptions = queryModule.watchlistDetailInfiniteQueryOptions;
  watchlistDetailQueryKey = queryModule.watchlistDetailQueryKey;

  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
});

afterAll(() => {
  closeDb?.();
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

    rollbackWatchedToggle({ queryClient, snapshot });

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
