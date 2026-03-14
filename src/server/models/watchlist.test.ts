import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import path from "path";

let db: ReturnType<typeof import("../../db/db.server").getDb>;
let watchlists: typeof import("../../db/schema").watchlists;
let watchlistItems: typeof import("../../db/schema").watchlistItems;
let getWatchlistByIdInternal: typeof import("./watchlist").getWatchlistByIdInternal;
let mergeWatchlistRecords: typeof import("./watchlist").mergeWatchlistRecords;
let setWatchlistItemWatchedState: typeof import("./watchlist").setWatchlistItemWatchedState;
let closeDb: typeof import("../../db/db.server").closeDb;

beforeAll(async () => {
  process.env.DATABASE_URL = ":memory:";
  const dbModule = await import("../../db/db.server");
  const schemaModule = await import("../../db/schema");
  const watchlistsModelModule = await import("./watchlist");

  db = dbModule.getDb();
  closeDb = dbModule.closeDb;
  watchlists = schemaModule.watchlists;
  watchlistItems = schemaModule.watchlistItems;
  getWatchlistByIdInternal = watchlistsModelModule.getWatchlistByIdInternal;
  mergeWatchlistRecords = watchlistsModelModule.mergeWatchlistRecords;
  setWatchlistItemWatchedState = watchlistsModelModule.setWatchlistItemWatchedState;

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

    const bySeries = await getWatchlistByIdInternal({
      id: list.id,
      page: 1,
      limit: 50,
      query: "Saga",
    });
    expect(bySeries.items).toHaveLength(1);
    expect(bySeries.items[0].parentTitle).toBe("Saga");

    const bySeriesLower = await getWatchlistByIdInternal({
      id: list.id,
      page: 1,
      limit: 50,
      query: "saga",
    });
    expect(bySeriesLower.items).toHaveLength(1);
    expect(bySeriesLower.items[0].parentTitle).toBe("Saga");

    const byItemTitle = await getWatchlistByIdInternal({
      id: list.id,
      page: 1,
      limit: 50,
      query: "Dune",
    });
    expect(byItemTitle.items).toHaveLength(1);
    expect(byItemTitle.items[0].title).toBe("Dune");

    const byEpisode = await getWatchlistByIdInternal({
      id: list.id,
      page: 1,
      limit: 50,
      query: "7",
    });
    expect(byEpisode.items).toHaveLength(1);
    expect(byEpisode.items[0].episode).toBe("7");
  });
});

describe("watchlist model workflows", () => {
  it("merges source watchlists into the target watchlist", async () => {
    const [target] = await db.insert(watchlists).values({ name: "Target" }).returning();
    const [source] = await db.insert(watchlists).values({ name: "Source" }).returning();

    await db.insert(watchlistItems).values([
      {
        watchlistId: target.id,
        tmdbId: "movie-1",
        source: "tmdb",
        mediaType: "movie",
        title: "Arrival",
        isWatched: false,
      },
      {
        watchlistId: source.id,
        tmdbId: "movie-1",
        source: "tmdb",
        mediaType: "movie",
        title: "Arrival",
        isWatched: true,
      },
      {
        watchlistId: source.id,
        tmdbId: "book-1",
        source: "google_books",
        mediaType: "book",
        title: "Dune",
        isWatched: false,
      },
    ]);

    const result = await mergeWatchlistRecords({
      targetWatchlistId: target.id,
      sourceWatchlistIds: [target.id, source.id],
    });

    const remainingWatchlists = await db.select().from(watchlists);
    const mergedItems = await db
      .select()
      .from(watchlistItems)
      .where(eq(watchlistItems.watchlistId, target.id));

    expect(result).toEqual({ success: true, targetId: target.id });
    expect(remainingWatchlists.map((watchlist) => watchlist.id)).toEqual([target.id]);
    expect(mergedItems).toHaveLength(2);
    expect(mergedItems.find((item) => item.tmdbId === "movie-1")?.isWatched).toBe(true);
    expect(mergedItems.find((item) => item.tmdbId === "book-1")?.title).toBe("Dune");
  });

  it("updates watched state and records the last watched timestamp", async () => {
    const [watchlist] = await db.insert(watchlists).values({ name: "Watched State" }).returning();
    const [item] = await db
      .insert(watchlistItems)
      .values({
        watchlistId: watchlist.id,
        tmdbId: "movie-2",
        source: "tmdb",
        mediaType: "movie",
        title: "Blade Runner",
        isWatched: false,
      })
      .returning();

    const result = await setWatchlistItemWatchedState({ itemId: item.id, isWatched: true });

    const [updatedItem] = await db
      .select()
      .from(watchlistItems)
      .where(eq(watchlistItems.id, item.id));
    const [updatedWatchlist] = await db
      .select()
      .from(watchlists)
      .where(eq(watchlists.id, watchlist.id));

    expect(result).toEqual({ itemId: item.id, isWatched: true });
    expect(updatedItem.isWatched).toBe(true);
    expect(updatedWatchlist.lastWatchedAt).toBeTruthy();
  });
});
