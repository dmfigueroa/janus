import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";

let db: ReturnType<typeof import("@/db/db.server").getDb>;
let watchlists: typeof import("@/db/schema").watchlists;
let watchlistItems: typeof import("@/db/schema").watchlistItems;
let closeDb: typeof import("@/db/db.server").closeDb;
let readWatchlistDetailScreen: typeof import("../read.server").WatchlistsRead.detailScreen;
let watchlistDetailInfiniteQueryOptions: typeof import("./query").watchlistDetailInfiniteQueryOptions;
let watchlistDetailQueryKey: typeof import("./query").watchlistDetailQueryKey;
type WatchlistDetailQueryFilters = import("./query").WatchlistDetailQueryFilters;
type WatchlistDetailQueryData = import("./query").WatchlistDetailQueryData;

beforeAll(async () => {
  process.env.DATABASE_URL = ":memory:";

  const dbModule = await import("@/db/db.server");
  const schemaModule = await import("@/db/schema");
  const queryModule = await import("./query");
  const readModule = await import("../read.server");
  db = dbModule.getDb();
  closeDb = dbModule.closeDb;
  watchlists = schemaModule.watchlists;
  watchlistItems = schemaModule.watchlistItems;
  readWatchlistDetailScreen = readModule.WatchlistsRead.detailScreen;
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
});
