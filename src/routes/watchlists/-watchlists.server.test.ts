import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "path";

let db: ReturnType<typeof import("@/db/server.server").getDb>;
let watchlists: typeof import("@/db/schema").watchlists;
let watchlistItems: typeof import("@/db/schema").watchlistItems;
let queryWatchlistDetailsById: typeof import("./watchlist/-details-query.server").queryWatchlistDetailsById;
let closeDb: typeof import("@/db/server.server").closeDb;

beforeAll(async () => {
  process.env.DATABASE_URL = ":memory:";
  const dbModule = await import("@/db/server.server");
  const schemaModule = await import("@/db/schema");
  const watchlistsModule = await import("./watchlist/-details-query.server");

  db = dbModule.getDb();
  closeDb = dbModule.closeDb;
  watchlists = schemaModule.watchlists;
  watchlistItems = schemaModule.watchlistItems;
  queryWatchlistDetailsById = watchlistsModule.queryWatchlistDetailsById;

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

describe("watchlist search", () => {
  it("searches by parent title, item title, and episode across sources", async () => {
    const [list] = await db.insert(watchlists).values({ name: "My List" }).returning();

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
      {
        watchlistId: list.id,
        tmdbId: "game-1",
        source: "rawg",
        mediaType: "game",
        title: "Hades",
      },
      {
        watchlistId: list.id,
        tmdbId: "anime-ep1",
        source: "anilist",
        mediaType: "episode",
        title: "Episode 1",
        parentTitle: "Cowboy Bebop",
        episode: "1",
      },
      {
        watchlistId: list.id,
        tmdbId: "manga-1",
        source: "anilist",
        mediaType: "manga",
        title: "Chapter 1",
        parentTitle: "Berserk",
        episode: "1",
      },
    ]);

    const bySeries = await queryWatchlistDetailsById({
      id: list.id,
      page: 1,
      limit: 50,
      query: "Saga",
    });
    expect(bySeries.items).toHaveLength(1);
    expect(bySeries.items[0].parentTitle).toBe("Saga");

    const bySeriesLower = await queryWatchlistDetailsById({
      id: list.id,
      page: 1,
      limit: 50,
      query: "saga",
    });
    expect(bySeriesLower.items).toHaveLength(1);
    expect(bySeriesLower.items[0].parentTitle).toBe("Saga");

    const byItemTitle = await queryWatchlistDetailsById({
      id: list.id,
      page: 1,
      limit: 50,
      query: "Dune",
    });
    expect(byItemTitle.items).toHaveLength(1);
    expect(byItemTitle.items[0].title).toBe("Dune");

    const byEpisode = await queryWatchlistDetailsById({
      id: list.id,
      page: 1,
      limit: 50,
      query: "7",
    });
    expect(byEpisode.items).toHaveLength(1);
    expect(byEpisode.items[0].episode).toBe("7");
  });
});
