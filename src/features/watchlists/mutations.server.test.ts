import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";

const { getMovieDetailsMock, getSeasonDetailsMock, getTVDetailsMock } = vi.hoisted(() => ({
  getMovieDetailsMock: vi.fn(),
  getSeasonDetailsMock: vi.fn(),
  getTVDetailsMock: vi.fn(),
}));

vi.mock("@/server/providers/tmdb-api.server", () => ({
  getMovieDetails: getMovieDetailsMock,
  getSeasonDetails: getSeasonDetailsMock,
  getTVDetails: getTVDetailsMock,
}));

let db: ReturnType<typeof import("@/db/db.server").getDb>;
let watchlists: typeof import("@/db/schema").watchlists;
let watchlistItems: typeof import("@/db/schema").watchlistItems;
let closeDb: typeof import("@/db/db.server").closeDb;
let WatchlistsRead: typeof import("./read.server").WatchlistsRead;
let WatchlistsWrite: typeof import("./write.server").WatchlistsWrite;

beforeAll(async () => {
  process.env.DATABASE_URL = ":memory:";

  const [dbModule, schemaModule, readModule, writeModule] = await Promise.all([
    import("@/db/db.server"),
    import("@/db/schema"),
    import("./read.server"),
    import("./write.server"),
  ]);

  db = dbModule.getDb();
  closeDb = dbModule.closeDb;
  watchlists = schemaModule.watchlists;
  watchlistItems = schemaModule.watchlistItems;
  WatchlistsRead = readModule.WatchlistsRead;
  WatchlistsWrite = writeModule.WatchlistsWrite;

  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
});

afterAll(() => {
  closeDb?.();
});

beforeEach(async () => {
  vi.clearAllMocks();
  await db.delete(watchlistItems);
  await db.delete(watchlists);
});

describe("watchlist mutation contract", () => {
  it("creates a watchlist through the feature mutation boundary so it appears in the list query", async () => {
    await WatchlistsWrite.create({
      name: "Weekend Movies",
      description: "Shortlist for Friday night",
    });

    const summaries = await WatchlistsRead.listScreen();

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      name: "Weekend Movies",
      description: "Shortlist for Friday night",
      stats: {
        totalItems: 0,
        watchedItems: 0,
        progress: 0,
        nextUnwatched: null,
      },
    });
  });

  it("deletes a watchlist through the feature mutation boundary so it disappears from read flows", async () => {
    const [watchlist] = await db
      .insert(watchlists)
      .values({
        name: "Archive",
        description: "Ready to remove",
      })
      .returning();

    await db.insert(watchlistItems).values({
      watchlistId: watchlist.id,
      tmdbId: "movie-1",
      source: "tmdb",
      mediaType: "movie",
      title: "Gone Soon",
      releaseDate: "2024-01-01",
      isWatched: false,
    });

    await WatchlistsWrite.delete({ id: watchlist.id });

    await expect(WatchlistsRead.listScreen()).resolves.toEqual([]);
    await expect(WatchlistsRead.detailScreen({ watchlistId: watchlist.id })).resolves.toBeNull();
  });

  it("toggles an item watched through the feature write boundary so detail reads reflect persisted progress", async () => {
    const [watchlist] = await db.insert(watchlists).values({ name: "Toggle Flow" }).returning();

    const [item] = await db
      .insert(watchlistItems)
      .values({
        watchlistId: watchlist.id,
        tmdbId: "toggle-me",
        source: "tmdb",
        mediaType: "movie",
        title: "Toggle Me",
        releaseDate: "2024-01-01",
        isWatched: false,
      })
      .returning();

    const result = await WatchlistsWrite.toggleWatched({
      itemId: item.id,
      isWatched: true,
    });

    const detail = await WatchlistsRead.detailScreen({
      watchlistId: watchlist.id,
      unwatchedOnly: false,
    });

    expect(result).toEqual({ success: true });
    expect(detail?.items[0]).toMatchObject({
      id: item.id,
      isWatched: true,
    });
    expect(detail?.watchlist.stats).toMatchObject({
      totalItems: 1,
      watchedItems: 1,
      progress: 100,
    });
  });

  it("merges selected watchlists into an existing target through the feature mutation boundary", async () => {
    const [target, source, untouched] = await db
      .insert(watchlists)
      .values([{ name: "Keep This List" }, { name: "Move These Items" }, { name: "Leave Alone" }])
      .returning();

    await db.insert(watchlistItems).values([
      {
        watchlistId: target.id,
        tmdbId: "shared-movie",
        source: "tmdb",
        mediaType: "movie",
        title: "Shared Movie",
        releaseDate: "2024-01-01",
        isWatched: false,
      },
      {
        watchlistId: source.id,
        tmdbId: "shared-movie",
        source: "tmdb",
        mediaType: "movie",
        title: "Shared Movie",
        releaseDate: "2024-01-01",
        isWatched: true,
      },
      {
        watchlistId: source.id,
        tmdbId: "source-only",
        source: "tmdb",
        mediaType: "movie",
        title: "Source Only",
        releaseDate: "2024-02-01",
        customRank: 1,
        isWatched: false,
      },
      {
        watchlistId: untouched.id,
        tmdbId: "untouched",
        source: "tmdb",
        mediaType: "movie",
        title: "Untouched",
        releaseDate: "2024-03-01",
        isWatched: false,
      },
    ]);

    const result = await WatchlistsWrite.merge({
      targetWatchlistId: target.id,
      sourceWatchlistIds: [target.id, source.id],
    });

    expect(result).toEqual({ success: true, targetId: target.id });

    const targetDetail = await WatchlistsRead.detailScreen({
      watchlistId: target.id,
      unwatchedOnly: false,
    });
    const sourceDetail = await WatchlistsRead.detailScreen({ watchlistId: source.id });
    const untouchedDetail = await WatchlistsRead.detailScreen({ watchlistId: untouched.id });

    expect(sourceDetail).toBeNull();
    expect(untouchedDetail?.items).toHaveLength(1);
    expect(targetDetail?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tmdbId: "shared-movie",
          title: "Shared Movie",
          isWatched: true,
        }),
        expect.objectContaining({
          tmdbId: "source-only",
          title: "Source Only",
          customRank: null,
          isWatched: false,
        }),
      ]),
    );
    expect(targetDetail?.watchlist.stats).toMatchObject({
      totalItems: 2,
      watchedItems: 1,
      progress: 50,
    });
  });

  it("creates a target watchlist when merging through the feature mutation boundary with a new name", async () => {
    const [firstSource, secondSource] = await db
      .insert(watchlists)
      .values([{ name: "First Source" }, { name: "Second Source" }])
      .returning();

    await db.insert(watchlistItems).values([
      {
        watchlistId: firstSource.id,
        tmdbId: "movie-1",
        source: "tmdb",
        mediaType: "movie",
        title: "First Movie",
        releaseDate: "2024-01-01",
        isWatched: true,
      },
      {
        watchlistId: secondSource.id,
        tmdbId: "movie-2",
        source: "tmdb",
        mediaType: "movie",
        title: "Second Movie",
        releaseDate: "2024-02-01",
        isWatched: false,
      },
    ]);

    const result = await WatchlistsWrite.merge({
      sourceWatchlistIds: [firstSource.id, secondSource.id],
      newWatchlistName: "Merged Queue",
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error(result.message);
    }

    const mergedDetail = await WatchlistsRead.detailScreen({
      watchlistId: result.targetId,
      unwatchedOnly: false,
    });

    expect(result.targetId).not.toBe(firstSource.id);
    expect(result.targetId).not.toBe(secondSource.id);
    expect(mergedDetail?.watchlist).toMatchObject({
      name: "Merged Queue",
      description: "Merged watchlist",
    });
    expect(mergedDetail?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tmdbId: "movie-1", title: "First Movie", isWatched: true }),
        expect.objectContaining({ tmdbId: "movie-2", title: "Second Movie", isWatched: false }),
      ]),
    );
    await expect(WatchlistsRead.detailScreen({ watchlistId: firstSource.id })).resolves.toBeNull();
    await expect(WatchlistsRead.detailScreen({ watchlistId: secondSource.id })).resolves.toBeNull();
  });

  it("rejects a merge when any selected source watchlist uses custom order", async () => {
    const [releaseSource, customSource] = await db
      .insert(watchlists)
      .values([{ name: "Release Source" }, { name: "Custom Source", itemOrderMode: "custom" }])
      .returning();

    const result = await WatchlistsWrite.merge({
      sourceWatchlistIds: [releaseSource.id, customSource.id],
      newWatchlistName: "Merged Queue",
    });

    expect(result).toEqual({
      success: false,
      message: "Merging custom-ordered watchlists is not supported yet.",
    });
    await expect(
      WatchlistsRead.detailScreen({ watchlistId: releaseSource.id }),
    ).resolves.not.toBeNull();
    await expect(
      WatchlistsRead.detailScreen({ watchlistId: customSource.id }),
    ).resolves.not.toBeNull();
    await expect(WatchlistsRead.listScreen()).resolves.toHaveLength(2);
  });

  it("rejects a merge into a custom-ordered target watchlist", async () => {
    const [target, source] = await db
      .insert(watchlists)
      .values([{ name: "Custom Target", itemOrderMode: "custom" }, { name: "Release Source" }])
      .returning();

    const result = await WatchlistsWrite.merge({
      targetWatchlistId: target.id,
      sourceWatchlistIds: [source.id],
    });

    expect(result).toEqual({
      success: false,
      message: "Merging custom-ordered watchlists is not supported yet.",
    });
    await expect(WatchlistsRead.detailScreen({ watchlistId: target.id })).resolves.not.toBeNull();
    await expect(WatchlistsRead.detailScreen({ watchlistId: source.id })).resolves.not.toBeNull();
  });

  it("rejects a merge without source watchlists before creating a target", async () => {
    await expect(
      WatchlistsWrite.merge({
        sourceWatchlistIds: [],
        newWatchlistName: "Should Not Exist",
      }),
    ).rejects.toThrow("At least one source watchlist must be selected");

    await expect(WatchlistsRead.listScreen()).resolves.toEqual([]);
  });

  it("adds a custom item through the feature write boundary so it appears in detail reads", async () => {
    const [watchlist] = await db
      .insert(watchlists)
      .values({
        name: "Custom Picks",
        description: "Manual additions",
      })
      .returning();

    const result = await WatchlistsWrite.add({
      watchlistId: watchlist.id,
      media: {
        id: "custom-movie-1",
        mediaType: "movie",
        source: "custom",
        title: "Local Screening",
        poster: "https://img.local/poster.jpg",
        year: "2025",
        overview: "Added manually",
      },
    });

    expect(result).toEqual({
      success: true,
      message: "Added to watchlist",
    });

    const detail = await WatchlistsRead.detailScreen({ watchlistId: watchlist.id });

    expect(detail?.items).toHaveLength(1);
    expect(detail?.items[0]).toMatchObject({
      watchlistId: watchlist.id,
      tmdbId: "custom-movie-1",
      source: "custom",
      mediaType: "movie",
      title: "Local Screening",
      posterPath: "https://img.local/poster.jpg",
      releaseDate: "2025",
      runtime: 0,
      isWatched: false,
    });
    expect(detail?.watchlist.stats).toMatchObject({
      totalItems: 1,
      watchedItems: 0,
      progress: 0,
    });
  });

  it("adds a TMDB movie through the feature write boundary using provider details", async () => {
    const [watchlist] = await db
      .insert(watchlists)
      .values({
        name: "Movie Night",
        description: "Provider-backed items",
      })
      .returning();

    getMovieDetailsMock.mockResolvedValue({
      title: "Fetched Title",
      name: undefined,
      poster_path: "/fetched-poster.jpg",
      release_date: "2024-02-03",
      vote_average: 8.7,
      runtime: 127,
    });

    const result = await WatchlistsWrite.add({
      watchlistId: watchlist.id,
      media: {
        id: "42",
        mediaType: "movie",
        source: "tmdb",
        title: "Search Result Title",
        poster: null,
        year: "2023",
        rating: 7.1,
      },
    });

    expect(result).toEqual({
      success: true,
      message: "Added to watchlist",
    });
    expect(getMovieDetailsMock).toHaveBeenCalledWith({ data: { id: 42 } });

    const detail = await WatchlistsRead.detailScreen({ watchlistId: watchlist.id });

    expect(detail?.items).toHaveLength(1);
    expect(detail?.items[0]).toMatchObject({
      watchlistId: watchlist.id,
      tmdbId: "42",
      source: "tmdb",
      mediaType: "movie",
      title: "Fetched Title",
      posterPath: "/fetched-poster.jpg",
      releaseDate: "2024-02-03",
      voteAverage: 8.7,
      runtime: 127,
    });
  });

  it("rejects custom TV items with a structured failure response", async () => {
    const [watchlist] = await db
      .insert(watchlists)
      .values({
        name: "Custom TV",
        description: "Unsupported source coverage",
      })
      .returning();

    const result = await WatchlistsWrite.add({
      watchlistId: watchlist.id,
      media: {
        id: "custom-tv-1",
        mediaType: "tv",
        source: "custom",
        title: "Local Series",
        poster: null,
        year: "2025",
      },
    });

    expect(result).toEqual({
      success: false,
      message: "TV shows must come from TMDB so Janus can expand them into episodes.",
    });

    const detail = await WatchlistsRead.detailScreen({ watchlistId: watchlist.id });

    expect(detail?.items).toHaveLength(0);
    expect(getTVDetailsMock).not.toHaveBeenCalled();
    expect(getSeasonDetailsMock).not.toHaveBeenCalled();
  });

  it("uses the provider show title and only reports newly added TMDB episodes", async () => {
    const [watchlist] = await db
      .insert(watchlists)
      .values({
        name: "Serialized Drama",
        description: "TV imports",
      })
      .returning();

    await db.insert(watchlistItems).values({
      watchlistId: watchlist.id,
      tmdbId: "1001",
      source: "tmdb",
      mediaType: "episode",
      title: "Pilot",
      parentTitle: "Provider Show",
      season: 1,
      episode: "1",
      releaseDate: "2024-01-10",
      isWatched: false,
    });

    getTVDetailsMock.mockResolvedValue({
      name: "Provider Show",
      poster_path: "/provider-show.jpg",
      seasons: [{ season_number: 0 }, { season_number: 1 }],
    });
    getSeasonDetailsMock.mockResolvedValue({
      episodes: [
        {
          id: 1001,
          name: "Pilot",
          season_number: 1,
          episode_number: 1,
          still_path: "/pilot.jpg",
          air_date: "2024-01-10",
          vote_average: 7.2,
          runtime: 42,
        },
        {
          id: 1002,
          name: "Second Wave",
          season_number: 1,
          episode_number: 2,
          still_path: null,
          air_date: "2024-01-17",
          vote_average: 7.8,
          runtime: 44,
        },
      ],
    });

    const result = await WatchlistsWrite.add({
      watchlistId: watchlist.id,
      media: {
        id: "42",
        mediaType: "tv",
        source: "tmdb",
        title: "Search Result Title",
        poster: null,
        year: "2024",
      },
    });

    expect(result).toEqual({
      success: true,
      message: "Added 1 new episode to watchlist",
    });

    const detail = await WatchlistsRead.detailScreen({ watchlistId: watchlist.id });

    expect(detail?.items).toHaveLength(2);
    expect(detail?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tmdbId: "1002",
          title: "Second Wave",
          parentTitle: "Provider Show",
          posterPath: "/provider-show.jpg",
          releaseDate: "2024-01-17",
        }),
      ]),
    );
  });
});
