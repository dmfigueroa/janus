import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "path";

let db: ReturnType<typeof import("../db/db.server").getDb>;
let watchlists: typeof import("../db/schema").watchlists;
let watchlistItems: typeof import("../db/schema").watchlistItems;
let getWatchlistDetail: typeof import("@/features/watchlists/detail/query.server").getWatchlistDetail;
let Watchlist: typeof import("./watchlist").Watchlist;
let closeDb: typeof import("../db/db.server").closeDb;

beforeAll(async () => {
  process.env.DATABASE_URL = ":memory:";

  const dbModule = await import("../db/db.server");
  const schemaModule = await import("../db/schema");
  const detailQueryModule = await import("@/features/watchlists/detail/query.server");
  const watchlistModelModule = await import("./watchlist");

  db = dbModule.getDb();
  closeDb = dbModule.closeDb;
  watchlists = schemaModule.watchlists;
  watchlistItems = schemaModule.watchlistItems;
  getWatchlistDetail = detailQueryModule.getWatchlistDetail;
  Watchlist = watchlistModelModule.Watchlist;

  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
});

afterAll(() => {
  closeDb?.();
});

beforeEach(async () => {
  if (!db) return;

  await db.delete(watchlistItems);
  await db.delete(watchlists);
});

describe("getWatchlistDetail", () => {
  it("returns null for a missing watchlist", async () => {
    await expect(getWatchlistDetail({ watchlistId: 999 })).resolves.toBeNull();
  });

  it("returns paginated items in release order", async () => {
    const [list] = await db.insert(watchlists).values({ name: "Timeline" }).returning();

    await db.insert(watchlistItems).values([
      {
        watchlistId: list.id,
        tmdbId: "march",
        source: "tmdb",
        mediaType: "movie",
        title: "March Release",
        releaseDate: "2024-03-01",
      },
      {
        watchlistId: list.id,
        tmdbId: "january",
        source: "tmdb",
        mediaType: "movie",
        title: "January Release",
        releaseDate: "2024-01-01",
      },
      {
        watchlistId: list.id,
        tmdbId: "february",
        source: "tmdb",
        mediaType: "movie",
        title: "February Release",
        releaseDate: "2024-02-01",
      },
    ]);

    const firstPage = await getWatchlistDetail({
      watchlistId: list.id,
      pageSize: 2,
    });
    const secondPage = await getWatchlistDetail({
      watchlistId: list.id,
      cursor: 2,
      pageSize: 2,
    });

    expect(firstPage?.items.map((item) => item.title)).toEqual([
      "January Release",
      "February Release",
    ]);
    expect(firstPage?.nextCursor).toBe(2);
    expect(secondPage?.items.map((item) => item.title)).toEqual(["March Release"]);
    expect(secondPage?.nextCursor).toBeUndefined();
  });

  it("applies text search across title, parent title, and episode", async () => {
    const [list] = await db.insert(watchlists).values({ name: "Searchable" }).returning();

    await db.insert(watchlistItems).values([
      {
        watchlistId: list.id,
        tmdbId: "comic-7",
        source: "comicvine",
        mediaType: "comic",
        title: "Issue One",
        parentTitle: "Saga",
        episode: "7",
      },
      {
        watchlistId: list.id,
        tmdbId: "movie-1",
        source: "tmdb",
        mediaType: "movie",
        title: "Inception",
      },
      {
        watchlistId: list.id,
        tmdbId: "book-1",
        source: "google_books",
        mediaType: "book",
        title: "Dune",
      },
    ]);

    const bySeries = await getWatchlistDetail({
      watchlistId: list.id,
      query: "saga",
    });
    const byTitle = await getWatchlistDetail({
      watchlistId: list.id,
      query: "Dune",
    });
    const byEpisode = await getWatchlistDetail({
      watchlistId: list.id,
      query: "7",
    });

    expect(bySeries?.items.map((item) => item.parentTitle)).toEqual(["Saga"]);
    expect(byTitle?.items.map((item) => item.title)).toEqual(["Dune"]);
    expect(byEpisode?.items.map((item) => item.episode)).toEqual(["7"]);
  });

  it("applies unwatchedOnly without changing the overall watchlist stats", async () => {
    const [list] = await db.insert(watchlists).values({ name: "Filterable" }).returning();

    await db.insert(watchlistItems).values([
      {
        watchlistId: list.id,
        tmdbId: "watched",
        source: "tmdb",
        mediaType: "movie",
        title: "Watched",
        releaseDate: "2024-01-01",
        isWatched: true,
      },
      {
        watchlistId: list.id,
        tmdbId: "next-up",
        source: "tmdb",
        mediaType: "movie",
        title: "Next Up",
        releaseDate: "2024-02-01",
        isWatched: false,
      },
      {
        watchlistId: list.id,
        tmdbId: "later",
        source: "tmdb",
        mediaType: "movie",
        title: "Later",
        releaseDate: "2024-03-01",
        isWatched: false,
      },
    ]);

    const detail = await getWatchlistDetail({
      watchlistId: list.id,
      cursor: 2,
      pageSize: 1,
      unwatchedOnly: true,
    });

    expect(detail?.items.map((item) => item.title)).toEqual(["Later"]);
    expect(detail?.watchlist.stats).toMatchObject({
      totalItems: 3,
      watchedItems: 1,
      progress: 33,
      coverImage: null,
    });
    expect(detail?.watchlist.stats.nextUnwatched?.title).toBe("Next Up");
  });

  it("treats null isWatched rows as unwatched in detail views", async () => {
    const [list] = await db.insert(watchlists).values({ name: "Legacy Detail" }).returning();

    await db.insert(watchlistItems).values([
      {
        watchlistId: list.id,
        tmdbId: "legacy-null",
        source: "tmdb",
        mediaType: "movie",
        title: "Legacy Next",
        releaseDate: "2024-01-01",
        isWatched: null,
      },
      {
        watchlistId: list.id,
        tmdbId: "watched",
        source: "tmdb",
        mediaType: "movie",
        title: "Already Watched",
        releaseDate: "2024-02-01",
        isWatched: true,
      },
    ]);

    const detail = await getWatchlistDetail({
      watchlistId: list.id,
      unwatchedOnly: true,
    });

    expect(detail?.items.map((item) => item.title)).toEqual(["Legacy Next"]);
    expect(detail?.watchlist.stats.nextUnwatched?.title).toBe("Legacy Next");
  });

  it("avoids full watchlist item scans when loading a detail page", async () => {
    const [list] = await db.insert(watchlists).values({ name: "Large List" }).returning();

    await db.insert(watchlistItems).values([
      {
        watchlistId: list.id,
        tmdbId: "item-1",
        source: "tmdb",
        mediaType: "movie",
        title: "Item 1",
        releaseDate: "2024-01-01",
        isWatched: true,
      },
      {
        watchlistId: list.id,
        tmdbId: "item-2",
        source: "tmdb",
        mediaType: "movie",
        title: "Item 2",
        releaseDate: "2024-02-01",
        isWatched: false,
      },
      {
        watchlistId: list.id,
        tmdbId: "item-3",
        source: "tmdb",
        mediaType: "movie",
        title: "Item 3",
        releaseDate: "2024-03-01",
        isWatched: false,
      },
    ]);

    const preparedSql: string[] = [];
    const sqlite = (db as typeof db & { $client: { prepare: (sql: string) => unknown } }).$client;
    const originalPrepare = sqlite.prepare.bind(sqlite);
    const prepareSpy = vi.spyOn(sqlite, "prepare").mockImplementation((query) => {
      preparedSql.push(query);
      return originalPrepare(query);
    });

    try {
      await getWatchlistDetail({
        watchlistId: list.id,
        cursor: 2,
        pageSize: 1,
        unwatchedOnly: true,
      });
    } finally {
      prepareSpy.mockRestore();
    }

    const watchlistItemSelects = preparedSql.filter((query) =>
      query.includes('from "watchlist_items"'),
    );

    expect(watchlistItemSelects.length).toBeGreaterThan(0);
    expect(
      watchlistItemSelects.every(
        (query) => query.includes("count(*)") || query.includes(" limit "),
      ),
    ).toBe(true);
  });
});

describe("Watchlist.listSummaries", () => {
  it("returns enriched watchlists with progress, next unwatched item, and cover selection", async () => {
    const [list] = await db.insert(watchlists).values({ name: "Movies and Shows" }).returning();

    await db.insert(watchlistItems).values([
      {
        watchlistId: list.id,
        tmdbId: "watched-1",
        source: "tmdb",
        mediaType: "movie",
        title: "Already Watched",
        posterPath: "/watched.jpg",
        releaseDate: "2024-03-01",
        isWatched: true,
      },
      {
        watchlistId: list.id,
        tmdbId: "next-1",
        source: "tmdb",
        mediaType: "episode",
        title: "Next Up",
        parentTitle: "Series",
        episode: "2",
        posterPath: "/next.jpg",
        releaseDate: "2024-04-01",
        isWatched: false,
      },
      {
        watchlistId: list.id,
        tmdbId: "later-1",
        source: "tmdb",
        mediaType: "movie",
        title: "Later",
        posterPath: "/later.jpg",
        releaseDate: "2024-05-01",
        isWatched: false,
      },
    ]);

    const summaries = await Watchlist.listSummaries();

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      id: list.id,
      name: "Movies and Shows",
      stats: {
        totalItems: 3,
        watchedItems: 1,
        progress: 33,
        coverImage: "/next.jpg",
        coverMediaType: "episode",
      },
    });
    expect(summaries[0].stats.nextUnwatched).toMatchObject({
      title: "Next Up",
      parentTitle: "Series",
      episode: "2",
    });
  });

  it("treats null isWatched rows as unwatched for summary selection", async () => {
    const [list] = await db.insert(watchlists).values({ name: "Legacy Imports" }).returning();

    await db.insert(watchlistItems).values([
      {
        watchlistId: list.id,
        tmdbId: "legacy-null",
        source: "tmdb",
        mediaType: "movie",
        title: "Legacy Next",
        posterPath: "/legacy.jpg",
        releaseDate: "2024-01-01",
        isWatched: null,
      },
      {
        watchlistId: list.id,
        tmdbId: "watched",
        source: "tmdb",
        mediaType: "movie",
        title: "Watched Later",
        posterPath: "/watched.jpg",
        releaseDate: "2024-02-01",
        isWatched: true,
      },
    ]);

    const [summary] = await Watchlist.listSummaries();

    expect(summary.stats).toMatchObject({
      totalItems: 2,
      watchedItems: 1,
      progress: 50,
      coverImage: "/legacy.jpg",
      coverMediaType: "movie",
    });
    expect(summary.stats.nextUnwatched?.title).toBe("Legacy Next");
  });

  it("respects supported sort orders", async () => {
    await db.insert(watchlists).values([
      {
        name: "Created First",
        createdAt: "2024-01-01 00:00:00",
      },
      {
        name: "Watched Most Recently",
        createdAt: "2024-02-01 00:00:00",
        lastWatchedAt: "2024-03-10 00:00:00",
        lastItemAddedAt: "2024-02-15 00:00:00",
      },
      {
        name: "Added Most Recently",
        createdAt: "2024-03-01 00:00:00",
        lastWatchedAt: "2024-01-15 00:00:00",
        lastItemAddedAt: "2024-04-20 00:00:00",
      },
    ]);

    const byCreatedAt = await Watchlist.listSummaries({
      orderBy: "createdAt",
      order: "asc",
    });
    const byLastWatched = await Watchlist.listSummaries({
      orderBy: "lastWatched",
      order: "desc",
    });
    const byLastAdded = await Watchlist.listSummaries({
      orderBy: "lastAdded",
      order: "desc",
    });

    expect(byCreatedAt.map((watchlist) => watchlist.name)).toEqual([
      "Created First",
      "Watched Most Recently",
      "Added Most Recently",
    ]);
    expect(byLastWatched.map((watchlist) => watchlist.name)).toEqual([
      "Watched Most Recently",
      "Added Most Recently",
      "Created First",
    ]);
    expect(byLastAdded.map((watchlist) => watchlist.name)).toEqual([
      "Added Most Recently",
      "Watched Most Recently",
      "Created First",
    ]);
  });

  it("avoids loading every watchlist item row when listing summaries", async () => {
    const [firstList] = await db.insert(watchlists).values({ name: "Large A" }).returning();
    const [secondList] = await db.insert(watchlists).values({ name: "Large B" }).returning();

    await db.insert(watchlistItems).values([
      {
        watchlistId: firstList.id,
        tmdbId: "a-1",
        source: "tmdb",
        mediaType: "movie",
        title: "A Watched",
        releaseDate: "2024-01-01",
        isWatched: true,
      },
      {
        watchlistId: firstList.id,
        tmdbId: "a-2",
        source: "tmdb",
        mediaType: "movie",
        title: "A Next",
        releaseDate: "2024-02-01",
        isWatched: false,
      },
      {
        watchlistId: secondList.id,
        tmdbId: "b-1",
        source: "tmdb",
        mediaType: "movie",
        title: "B First",
        releaseDate: "2024-03-01",
        isWatched: false,
      },
      {
        watchlistId: secondList.id,
        tmdbId: "b-2",
        source: "tmdb",
        mediaType: "movie",
        title: "B Second",
        releaseDate: "2024-04-01",
        isWatched: false,
      },
    ]);

    const preparedSql: string[] = [];
    const sqlite = (db as typeof db & { $client: { prepare: (sql: string) => unknown } }).$client;
    const originalPrepare = sqlite.prepare.bind(sqlite);
    const prepareSpy = vi.spyOn(sqlite, "prepare").mockImplementation((query) => {
      preparedSql.push(query);
      return originalPrepare(query);
    });

    try {
      await Watchlist.listSummaries();
    } finally {
      prepareSpy.mockRestore();
    }

    const watchlistItemSelects = preparedSql.filter((query) =>
      query.includes('from "watchlist_items"'),
    );

    expect(watchlistItemSelects.length).toBeGreaterThan(0);
    expect(
      watchlistItemSelects.every(
        (query) =>
          query.includes("count(*)") || query.includes(" limit ") || query.includes("row_number()"),
      ),
    ).toBe(true);
  });
});
