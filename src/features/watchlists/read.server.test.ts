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

  it("uses active custom item order for summary next-up selection", async () => {
    const [watchlist] = await db
      .insert(watchlists)
      .values({ name: "Custom Summary", itemOrderMode: "custom" })
      .returning();

    await db.insert(watchlistItems).values([
      {
        watchlistId: watchlist.id,
        tmdbId: "release-first",
        source: "tmdb",
        mediaType: "movie",
        title: "Release First",
        posterPath: "/release-first.jpg",
        releaseDate: "2024-01-01",
        customRank: 2,
        isWatched: false,
      },
      {
        watchlistId: watchlist.id,
        tmdbId: "custom-first",
        source: "tmdb",
        mediaType: "movie",
        title: "Custom First",
        posterPath: "/custom-first.jpg",
        releaseDate: "2024-02-01",
        customRank: 1,
        isWatched: false,
      },
    ]);

    const [summary] = await WatchlistsRead.listScreen();

    expect(summary?.stats.nextUnwatched?.title).toBe("Custom First");
  });

  it("uses active custom item order for summary cover selection", async () => {
    const [watchlist] = await db
      .insert(watchlists)
      .values({ name: "Custom Cover", itemOrderMode: "custom" })
      .returning();

    await db.insert(watchlistItems).values([
      {
        watchlistId: watchlist.id,
        tmdbId: "release-first",
        source: "tmdb",
        mediaType: "movie",
        title: "Release First",
        posterPath: "/release-first.jpg",
        releaseDate: "2024-01-01",
        customRank: 2,
        isWatched: true,
      },
      {
        watchlistId: watchlist.id,
        tmdbId: "custom-first",
        source: "tmdb",
        mediaType: "episode",
        title: "Custom First",
        posterPath: "/custom-first.jpg",
        releaseDate: "2024-02-01",
        customRank: 1,
        isWatched: true,
      },
    ]);

    const [summary] = await WatchlistsRead.listScreen();

    expect(summary?.stats).toMatchObject({
      coverImage: "/custom-first.jpg",
      coverMediaType: "episode",
    });
  });

  it("preserves release-mode summary selection when custom ranks exist", async () => {
    const [watchlist] = await db
      .insert(watchlists)
      .values({ name: "Release Summary", itemOrderMode: "release" })
      .returning();

    await db.insert(watchlistItems).values([
      {
        watchlistId: watchlist.id,
        tmdbId: "release-first",
        source: "tmdb",
        mediaType: "movie",
        title: "Release First",
        posterPath: "/release-first.jpg",
        releaseDate: "2024-01-01",
        customRank: 2,
        isWatched: false,
      },
      {
        watchlistId: watchlist.id,
        tmdbId: "custom-first",
        source: "tmdb",
        mediaType: "episode",
        title: "Custom First",
        posterPath: "/custom-first.jpg",
        releaseDate: "2024-02-01",
        customRank: 1,
        isWatched: false,
      },
    ]);

    const [summary] = await WatchlistsRead.listScreen();

    expect(summary?.stats.nextUnwatched?.title).toBe("Release First");
    expect(summary?.stats).toMatchObject({
      coverImage: "/release-first.jpg",
      coverMediaType: "movie",
    });
  });
});
