import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { watchlistListQueryKey } from "./queries";

let db: ReturnType<typeof import("@/db/db.server").getDb>;
let watchlists: typeof import("@/db/schema").watchlists;
let watchlistItems: typeof import("@/db/schema").watchlistItems;
let WatchlistsRead: typeof import("./read.server").WatchlistsRead;
let closeDb: typeof import("@/db/db.server").closeDb;

beforeAll(async () => {
  process.env.DATABASE_URL = ":memory:";

  const dbModule = await import("@/db/db.server");
  const schemaModule = await import("@/db/schema");
  const readModule = await import("./read.server");

  db = dbModule.getDb();
  closeDb = dbModule.closeDb;
  watchlists = schemaModule.watchlists;
  watchlistItems = schemaModule.watchlistItems;
  WatchlistsRead = readModule.WatchlistsRead;

  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
});

afterAll(() => {
  closeDb?.();
});

beforeEach(async () => {
  await db.delete(watchlistItems);
  await db.delete(watchlists);
});

describe("WatchlistsRead.listScreen", () => {
  it("keys list queries by normalized filters", () => {
    expect(watchlistListQueryKey({ orderBy: "lastAdded" })).toEqual([
      "watchlists",
      "list",
      {
        orderBy: "lastAdded",
        order: "desc",
      },
    ]);
    expect(watchlistListQueryKey({ orderBy: "lastWatched", order: "asc" })).toEqual([
      "watchlists",
      "list",
      {
        orderBy: "lastWatched",
        order: "asc",
      },
    ]);
  });

  it("returns an empty list when there are no watchlists", async () => {
    await expect(WatchlistsRead.listScreen()).resolves.toEqual([]);
  });

  it("returns sorted summaries with derived watchlist stats", async () => {
    const [olderList] = await db
      .insert(watchlists)
      .values({
        name: "Watched Earlier",
        lastWatchedAt: "2024-01-10 00:00:00",
      })
      .returning();
    const [newerList] = await db
      .insert(watchlists)
      .values({
        name: "Watched Later",
        lastWatchedAt: "2024-03-10 00:00:00",
      })
      .returning();

    await db.insert(watchlistItems).values([
      {
        watchlistId: olderList.id,
        tmdbId: "older-watched",
        source: "tmdb",
        mediaType: "movie",
        title: "Already Watched",
        releaseDate: "2024-01-01",
        isWatched: true,
      },
      {
        watchlistId: olderList.id,
        tmdbId: "older-next",
        source: "tmdb",
        mediaType: "episode",
        title: "Next Up",
        parentTitle: "Series",
        episode: "2",
        posterPath: "/next.jpg",
        releaseDate: "2024-02-01",
        isWatched: false,
      },
    ]);

    const summaries = await WatchlistsRead.listScreen({
      orderBy: "lastWatched",
      order: "asc",
    });

    expect(summaries.map((watchlist) => watchlist.name)).toEqual([
      "Watched Earlier",
      "Watched Later",
    ]);
    expect(summaries[1]?.id).toBe(newerList.id);
    expect(summaries[0]?.stats).toMatchObject({
      totalItems: 2,
      watchedItems: 1,
      progress: 50,
      coverImage: "/next.jpg",
      coverMediaType: "episode",
    });
    expect(summaries[0]?.stats.nextUnwatched).toMatchObject({
      title: "Next Up",
      parentTitle: "Series",
      episode: "2",
    });
    expect(summaries[1]?.stats).toMatchObject({
      totalItems: 0,
      watchedItems: 0,
      progress: 0,
      nextUnwatched: null,
      coverImage: null,
      coverMediaType: null,
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

    const [summary] = await WatchlistsRead.listScreen();

    expect(summary.stats).toMatchObject({
      totalItems: 2,
      watchedItems: 1,
      progress: 50,
      coverImage: "/legacy.jpg",
      coverMediaType: "movie",
    });
    expect(summary.stats.nextUnwatched?.title).toBe("Legacy Next");
  });
});

describe("WatchlistsRead.detailScreen", () => {
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

    const firstPage = await WatchlistsRead.detailScreen({
      watchlistId: list.id,
      pageSize: 2,
    });
    const secondPage = await WatchlistsRead.detailScreen({
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

    const bySeries = await WatchlistsRead.detailScreen({
      watchlistId: list.id,
      query: "saga",
    });
    const byTitle = await WatchlistsRead.detailScreen({
      watchlistId: list.id,
      query: "Dune",
    });
    const byEpisode = await WatchlistsRead.detailScreen({
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

    const detail = await WatchlistsRead.detailScreen({
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

    const detail = await WatchlistsRead.detailScreen({
      watchlistId: list.id,
      unwatchedOnly: true,
    });

    expect(detail?.items.map((item) => item.title)).toEqual(["Legacy Next"]);
    expect(detail?.watchlist.stats.nextUnwatched?.title).toBe("Legacy Next");
  });
});
