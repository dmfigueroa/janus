import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";

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
});
