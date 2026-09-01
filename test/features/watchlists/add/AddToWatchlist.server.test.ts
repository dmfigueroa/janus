import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/Schema";
import { createIsolatedTestDb, type IsolatedTestDb } from "@test/IsolatedDb";
import {
  createTestWatchlist,
  createTestWatchlistItem,
} from "@test/features/watchlists/test/WatchlistTestData.server";

const { getMovieDetailsMock, getSeasonDetailsMock, getTVDetailsMock } = vi.hoisted(() => ({
  getMovieDetailsMock: vi.fn(),
  getSeasonDetailsMock: vi.fn(),
  getTVDetailsMock: vi.fn(),
}));
const dbState = vi.hoisted(() => ({ db: undefined as IsolatedTestDb | undefined }));

vi.mock("@/server/providers/TmdbApi.server", () => ({
  fetchTmdbMovie: getMovieDetailsMock,
  fetchTmdbSeason: getSeasonDetailsMock,
  fetchTmdbTv: getTVDetailsMock,
}));
vi.mock("@/db/Db.server", () => ({ getDb: () => dbState.db }));

let testDb: Awaited<ReturnType<typeof createIsolatedTestDb>>;
let db: IsolatedTestDb;
let addToWatchlistMutation: typeof import("@/features/watchlists/add/Mutation.server").addToWatchlistMutation;
let addProviderMediaToWatchlist: typeof import("@/features/watchlists/add/AddProviderMedia.server").addProviderMediaToWatchlist;
let readWatchlistDetail: typeof import("@/features/watchlists/Read.server").WatchlistsRead.detailScreen;

beforeAll(async () => {
  testDb = await createIsolatedTestDb();
  db = testDb.db;
  dbState.db = db;
  const [addModule, addProviderMediaModule, readModule] = await Promise.all([
    import("@/features/watchlists/add/Mutation.server"),
    import("@/features/watchlists/add/AddProviderMedia.server"),
    import("@/features/watchlists/Read.server"),
  ]);
  addToWatchlistMutation = addModule.addToWatchlistMutation;
  addProviderMediaToWatchlist = addProviderMediaModule.addProviderMediaToWatchlist;
  readWatchlistDetail = readModule.WatchlistsRead.detailScreen;
});

afterAll(() => testDb.close());

beforeEach(async () => {
  vi.clearAllMocks();
  await db.delete(schema.watchlistItems);
  await db.delete(schema.watchlists);
});

describe("add to watchlist mutation", () => {
  it("adds a custom item", async () => {
    const watchlist = await createTestWatchlist(db, { name: "Custom Picks" });
    const result = await addToWatchlistMutation({
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
    const detail = await readWatchlistDetail({ watchlistId: watchlist.id });

    expect(result).toEqual({ success: true, message: "Added to watchlist" });
    expect(detail?.items[0]).toMatchObject({
      tmdbId: "custom-movie-1",
      title: "Local Screening",
      posterPath: "https://img.local/poster.jpg",
      releaseDate: "2025",
    });
  });

  it("supports beginning insertion in custom order", async () => {
    const watchlist = await createTestWatchlist(db, {
      name: "Priority Queue",
      itemOrderMode: "custom",
    });
    await Promise.all([
      createTestWatchlistItem(db, {
        watchlistId: watchlist.id,
        tmdbId: "existing-1",
        source: "custom",
        title: "Existing First",
        customRank: 1,
      }),
      createTestWatchlistItem(db, {
        watchlistId: watchlist.id,
        tmdbId: "existing-2",
        source: "custom",
        title: "Existing Second",
        customRank: 2,
      }),
    ]);

    await addToWatchlistMutation({
      watchlistId: watchlist.id,
      insertionPosition: "beginning",
      media: {
        id: "urgent-pick",
        mediaType: "movie",
        source: "custom",
        title: "Urgent Pick",
        poster: null,
        year: "2025",
      },
    });
    const detail = await readWatchlistDetail({ watchlistId: watchlist.id, unwatchedOnly: false });

    expect(detail?.items.map((item) => item.title)).toEqual([
      "Urgent Pick",
      "Existing First",
      "Existing Second",
    ]);
  });
});

describe("custom order add to watchlist mutation", () => {
  it("inserts release-adjacent additions deterministically", async () => {
    const watchlist = await createTestWatchlist(db, {
      name: "Chronology",
      itemOrderMode: "custom",
    });
    await Promise.all([
      createTestWatchlistItem(db, {
        watchlistId: watchlist.id,
        tmdbId: "alpha",
        source: "custom",
        title: "Alpha",
        releaseDate: "2024-01-01",
        customRank: 1,
      }),
      createTestWatchlistItem(db, {
        watchlistId: watchlist.id,
        tmdbId: "beta",
        source: "custom",
        title: "Beta",
        releaseDate: "2024-01-01",
        customRank: 2,
      }),
      createTestWatchlistItem(db, {
        watchlistId: watchlist.id,
        tmdbId: "gamma",
        source: "custom",
        title: "Gamma",
        releaseDate: "2024-03-01",
        customRank: 3,
      }),
    ]);

    await addToWatchlistMutation({
      watchlistId: watchlist.id,
      insertionPosition: "release-adjacent",
      media: {
        id: "new-same-date",
        mediaType: "movie",
        source: "custom",
        title: "New Same Date",
        poster: null,
        year: "2024",
        releaseDate: "2024-01-01",
      },
    });
    await addToWatchlistMutation({
      watchlistId: watchlist.id,
      insertionPosition: "release-adjacent",
      media: {
        id: "new-earliest",
        mediaType: "movie",
        source: "custom",
        title: "New Earliest",
        poster: null,
        year: "2023",
        releaseDate: "2023-12-01",
      },
    });
    await addToWatchlistMutation({
      watchlistId: watchlist.id,
      insertionPosition: "release-adjacent",
      media: {
        id: "new-undated",
        mediaType: "movie",
        source: "custom",
        title: "New Undated",
        poster: null,
        year: "",
      },
    });

    const detail = await readWatchlistDetail({ watchlistId: watchlist.id, unwatchedOnly: false });
    expect(detail?.items.map((item) => item.title)).toEqual([
      "New Earliest",
      "Alpha",
      "Beta",
      "New Same Date",
      "Gamma",
      "New Undated",
    ]);
  });
});

describe("custom order add validation", () => {
  it("requires an insertion choice for custom order", async () => {
    const watchlist = await createTestWatchlist(db, {
      name: "Choose First",
      itemOrderMode: "custom",
    });
    const result = await addToWatchlistMutation({
      watchlistId: watchlist.id,
      media: {
        id: "missing-choice",
        mediaType: "movie",
        source: "custom",
        title: "Missing Choice",
        poster: null,
        year: "2025",
      },
    });

    expect(result).toEqual({
      success: false,
      message: "Choose where to insert this item in the custom order.",
    });
  });
});

describe("provider-backed add to watchlist mutation", () => {
  it("resolves a provider-ID-only TMDB movie with canonical details", async () => {
    const watchlist = await createTestWatchlist(db, { name: "Canonical provider movie" });
    getMovieDetailsMock.mockResolvedValue({
      title: "Canonical Title",
      poster_path: "/canonical-poster.jpg",
      release_date: "2024-02-03",
      vote_average: 8.7,
      runtime: 127,
    });

    const result = await addProviderMediaToWatchlist({
      watchlistId: watchlist.id,
      provider: "tmdb",
      providerId: "42",
      mediaType: "movie",
    });
    const detail = await readWatchlistDetail({ watchlistId: watchlist.id });

    expect(result).toEqual({
      success: true,
      code: "added",
      message: "Added to watchlist",
      affectedCount: 1,
    });
    expect(detail?.items[0]).toMatchObject({
      tmdbId: "42",
      title: "Canonical Title",
      releaseDate: "2024-02-03",
      posterPath: "/canonical-poster.jpg",
    });
  });

  it("uses provider details for TMDB movies", async () => {
    const watchlist = await createTestWatchlist(db, { name: "Movie Night" });
    getMovieDetailsMock.mockResolvedValue({
      title: "Fetched Title",
      poster_path: "/fetched-poster.jpg",
      release_date: "2024-02-03",
      vote_average: 8.7,
      runtime: 127,
    });

    const result = await addToWatchlistMutation({
      watchlistId: watchlist.id,
      media: {
        id: "42",
        mediaType: "movie",
        source: "tmdb",
        title: "Search Result Title",
        poster: null,
        year: "2023",
      },
    });
    const detail = await readWatchlistDetail({ watchlistId: watchlist.id });

    expect(result).toEqual({ success: true, message: "Added to watchlist" });
    expect(getMovieDetailsMock).toHaveBeenCalledWith({ id: 42 });
    expect(detail?.items[0]).toMatchObject({ title: "Fetched Title", runtime: 127 });
  });
});

describe("TV add to watchlist mutation", () => {
  it("rejects custom TV items", async () => {
    const watchlist = await createTestWatchlist(db, { name: "Custom TV" });
    const result = await addToWatchlistMutation({
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
    expect(getTVDetailsMock).not.toHaveBeenCalled();
    expect(getSeasonDetailsMock).not.toHaveBeenCalled();
  });

  it("adds only new episodes using the provider show title", async () => {
    const watchlist = await createTestWatchlist(db, { name: "Serialized Drama" });
    await createTestWatchlistItem(db, {
      watchlistId: watchlist.id,
      tmdbId: "1001",
      source: "tmdb",
      mediaType: "episode",
      title: "Pilot",
      parentId: "tmdb:42",
      parentTitle: "Provider Show",
      season: 1,
      episode: "1",
      releaseDate: "2024-01-10",
    });
    getTVDetailsMock.mockResolvedValue({
      name: "Provider Show",
      poster_path: "/provider-show.jpg",
      seasons: [{ season_number: 1 }],
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

    const result = await addToWatchlistMutation({
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
    const detail = await readWatchlistDetail({ watchlistId: watchlist.id });

    expect(result).toEqual({ success: true, message: "Added 1 new episode to watchlist" });
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
