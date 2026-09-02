import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/Schema";
import { createIsolatedTestDb, type IsolatedTestDb } from "@test/IsolatedDb";
import {
  createTestWatchlist,
  createTestWatchlistItem,
} from "@test/features/watchlists/test/WatchlistTestData.server";

const {
  getBookDetailsMock,
  getComicIssuesMock,
  getComicVolumeDetailsMock,
  getGameDetailsMock,
  getMovieDetailsMock,
  getSeasonDetailsMock,
  getTVDetailsMock,
} = vi.hoisted(() => ({
  getBookDetailsMock: vi.fn(),
  getComicIssuesMock: vi.fn(),
  getComicVolumeDetailsMock: vi.fn(),
  getGameDetailsMock: vi.fn(),
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
vi.mock("@/server/providers/GoogleBooks.server", () => ({ getBookDetails: getBookDetailsMock }));
vi.mock("@/server/providers/Rawg.server", () => ({ getGameDetails: getGameDetailsMock }));
vi.mock("@/server/providers/Comicvine.server", () => ({
  getComicIssues: getComicIssuesMock,
}));
vi.mock("@/integrations/comicvine/ComicvineVolume.server", () => ({
  getComicVolumeDetails: getComicVolumeDetailsMock,
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
      code: "insertion_choice_required",
      message: "Choose where to insert this item in the custom order.",
    });
  });
});

describe("anchored add to custom-ordered watchlist", () => {
  it("places a new item before a reference and shifts later items down by one", async () => {
    const watchlist = await createTestWatchlist(db, {
      name: "Anchored Queue",
      itemOrderMode: "custom",
    });
    const [first, second, third] = await Promise.all([
      createTestWatchlistItem(db, {
        watchlistId: watchlist.id,
        tmdbId: "anchor-first",
        source: "custom",
        title: "First",
        customRank: 1,
      }),
      createTestWatchlistItem(db, {
        watchlistId: watchlist.id,
        tmdbId: "anchor-second",
        source: "custom",
        title: "Second",
        customRank: 2,
      }),
      createTestWatchlistItem(db, {
        watchlistId: watchlist.id,
        tmdbId: "anchor-third",
        source: "custom",
        title: "Third",
        customRank: 3,
      }),
    ]);

    const result = await addToWatchlistMutation({
      watchlistId: watchlist.id,
      insertionPosition: "before",
      referenceItemId: second.id,
      media: {
        id: "anchor-new",
        mediaType: "movie",
        source: "custom",
        title: "Inserted Before Second",
        poster: null,
        year: "2025",
      },
    });

    expect(result.success).toBe(true);
    const detail = await readWatchlistDetail({
      watchlistId: watchlist.id,
      unwatchedOnly: false,
    });
    expect(detail?.items.map((item) => item.title)).toEqual([
      "First",
      "Inserted Before Second",
      "Second",
      "Third",
    ]);
    expect(detail?.items.find((item) => item.title === "First")?.customRank).toBe(1);
    expect(detail?.items.find((item) => item.title === "Inserted Before Second")?.customRank).toBe(
      2,
    );
    expect(detail?.items.find((item) => item.title === "Second")?.customRank).toBe(3);
    expect(detail?.items.find((item) => item.title === "Third")?.customRank).toBe(4);
    expect(first.id).toBeDefined();
    expect(second.id).toBeDefined();
    expect(third.id).toBeDefined();
  });

  it("places a new item after a reference and shifts only later items down by one", async () => {
    const watchlist = await createTestWatchlist(db, {
      name: "Anchored After Queue",
      itemOrderMode: "custom",
    });
    const [, second] = await Promise.all([
      createTestWatchlistItem(db, {
        watchlistId: watchlist.id,
        tmdbId: "anchor-after-first",
        source: "custom",
        title: "First",
        customRank: 1,
      }),
      createTestWatchlistItem(db, {
        watchlistId: watchlist.id,
        tmdbId: "anchor-after-second",
        source: "custom",
        title: "Second",
        customRank: 2,
      }),
      createTestWatchlistItem(db, {
        watchlistId: watchlist.id,
        tmdbId: "anchor-after-third",
        source: "custom",
        title: "Third",
        customRank: 3,
      }),
    ]);

    const result = await addToWatchlistMutation({
      watchlistId: watchlist.id,
      insertionPosition: "after",
      referenceItemId: second.id,
      media: {
        id: "anchor-after-new",
        mediaType: "movie",
        source: "custom",
        title: "Inserted After Second",
        poster: null,
        year: "2025",
      },
    });

    expect(result.success).toBe(true);
    const detail = await readWatchlistDetail({
      watchlistId: watchlist.id,
      unwatchedOnly: false,
    });
    expect(detail?.items.map((item) => item.title)).toEqual([
      "First",
      "Second",
      "Inserted After Second",
      "Third",
    ]);
    expect(detail?.items.find((item) => item.title === "First")?.customRank).toBe(1);
    expect(detail?.items.find((item) => item.title === "Second")?.customRank).toBe(2);
    expect(detail?.items.find((item) => item.title === "Inserted After Second")?.customRank).toBe(
      3,
    );
    expect(detail?.items.find((item) => item.title === "Third")?.customRank).toBe(4);
  });

  it("rejects an anchor whose reference item is unranked with invalid_reference", async () => {
    const watchlist = await createTestWatchlist(db, {
      name: "Unranked Reference",
      itemOrderMode: "custom",
    });
    const [ranked, unranked] = await Promise.all([
      createTestWatchlistItem(db, {
        watchlistId: watchlist.id,
        tmdbId: "ranked-anchor",
        source: "custom",
        title: "Ranked",
        customRank: 1,
      }),
      createTestWatchlistItem(db, {
        watchlistId: watchlist.id,
        tmdbId: "unranked-anchor",
        source: "custom",
        title: "Unranked",
        customRank: null,
      }),
    ]);

    const result = await addToWatchlistMutation({
      watchlistId: watchlist.id,
      insertionPosition: "before",
      referenceItemId: unranked.id,
      media: {
        id: "anchor-blocked",
        mediaType: "movie",
        source: "custom",
        title: "Should Not Land",
        poster: null,
        year: "2025",
      },
    });

    expect(result).toEqual({
      success: false,
      code: "invalid_reference",
      message: expect.stringContaining("not in this watchlist"),
    });
    const detail = await readWatchlistDetail({
      watchlistId: watchlist.id,
      unwatchedOnly: false,
    });
    expect(detail?.items.map((item) => item.title)).toEqual(["Ranked", "Unranked"]);
    expect(ranked.id).toBeDefined();
    expect(unranked.id).toBeDefined();
  });

  it("rejects an anchor on a release-ordered watchlist with not_custom_mode", async () => {
    const watchlist = await createTestWatchlist(db, {
      name: "Release Ordered Anchor Block",
      itemOrderMode: "release",
    });
    const existing = await createTestWatchlistItem(db, {
      watchlistId: watchlist.id,
      tmdbId: "release-anchor-existing",
      source: "custom",
      title: "Existing",
    });

    const result = await addToWatchlistMutation({
      watchlistId: watchlist.id,
      insertionPosition: "before",
      referenceItemId: existing.id,
      media: {
        id: "release-anchor-blocked",
        mediaType: "movie",
        source: "custom",
        title: "Should Not Land",
        poster: null,
        year: "2025",
      },
    });

    expect(result).toEqual({
      success: false,
      code: "not_custom_mode",
      message: "Anchored insertion is only available in custom mode.",
    });
    const detail = await readWatchlistDetail({
      watchlistId: watchlist.id,
      unwatchedOnly: false,
    });
    expect(detail?.items.map((item) => item.title)).toEqual(["Existing"]);
  });

  it("trails batch siblings after the anchor in customRank order", async () => {
    const watchlist = await createTestWatchlist(db, {
      name: "Trailing Siblings",
      itemOrderMode: "custom",
    });
    const [, anchor] = await Promise.all([
      createTestWatchlistItem(db, {
        watchlistId: watchlist.id,
        tmdbId: "trail-prev",
        source: "custom",
        title: "Pre Anchor",
        customRank: 1,
      }),
      createTestWatchlistItem(db, {
        watchlistId: watchlist.id,
        tmdbId: "trail-anchor",
        source: "custom",
        title: "Anchor",
        customRank: 2,
      }),
    ]);

    process.env.TMDB_API_KEY = "test-tmdb-key";
    getMovieDetailsMock.mockResolvedValue({
      title: "Anchor Movie One",
      poster_path: null,
      release_date: "2024-02-03",
      vote_average: 8.7,
      runtime: 127,
    });
    await addProviderMediaToWatchlist({
      watchlistId: watchlist.id,
      provider: "tmdb",
      providerId: "anchor-movie-1",
      mediaType: "movie",
      insertionPosition: "after",
      referenceItemId: anchor.id,
    });

    const detail = await readWatchlistDetail({
      watchlistId: watchlist.id,
      unwatchedOnly: false,
    });
    expect(detail?.items.map((item) => item.title)).toEqual([
      "Pre Anchor",
      "Anchor",
      "Anchor Movie One",
    ]);
  });
});

describe("provider-backed add to watchlist mutation", () => {
  it("resolves Google Books IDs to canonical book metadata", async () => {
    const watchlist = await createTestWatchlist(db, { name: "Canonical books" });
    getBookDetailsMock.mockResolvedValue({
      id: "book-42",
      source: "google_books",
      mediaType: "book",
      title: "Canonical Book",
      poster: "https://example.test/book.jpg",
      year: "1969",
      releaseDate: "1969-03-01",
      rating: 9,
      authors: ["Ursula K. Le Guin"],
    });

    await expect(
      addProviderMediaToWatchlist({
        watchlistId: watchlist.id,
        provider: "google_books",
        providerId: "book-42",
        mediaType: "book",
      }),
    ).resolves.toMatchObject({ success: true, code: "added" });

    await expect(readWatchlistDetail({ watchlistId: watchlist.id })).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          tmdbId: "book-42",
          source: "google_books",
          title: "Canonical Book",
          releaseDate: "1969-03-01",
        }),
      ],
    });
  });

  it("resolves RAWG IDs to canonical game metadata", async () => {
    const watchlist = await createTestWatchlist(db, { name: "Canonical games" });
    process.env.RAWG_API_KEY = "test-rawg-key";
    getGameDetailsMock.mockResolvedValue({
      id: "3498",
      source: "rawg",
      mediaType: "game",
      title: "Canonical Game",
      poster: "https://example.test/game.jpg",
      year: "2013",
      releaseDate: "2013-09-17",
      rating: 9,
    });

    await expect(
      addProviderMediaToWatchlist({
        watchlistId: watchlist.id,
        provider: "rawg",
        providerId: "3498",
        mediaType: "game",
      }),
    ).resolves.toMatchObject({ success: true, code: "added" });

    await expect(readWatchlistDetail({ watchlistId: watchlist.id })).resolves.toMatchObject({
      items: [expect.objectContaining({ tmdbId: "3498", source: "rawg", title: "Canonical Game" })],
    });
  });

  it("resolves ComicVine IDs to canonical volume metadata", async () => {
    const watchlist = await createTestWatchlist(db, { name: "Canonical comics" });
    process.env.COMICVINE_API_KEY = "test-comicvine-key";
    getComicVolumeDetailsMock.mockResolvedValue({ title: "Canonical Volume" });
    getComicIssuesMock.mockResolvedValue([
      {
        id: "issue-1",
        title: "Canonical Issue",
        issueNumber: "1",
        poster: "https://example.test/issue.jpg",
        coverDate: "2012-03-14",
      },
    ]);

    await expect(
      addProviderMediaToWatchlist({
        watchlistId: watchlist.id,
        provider: "comicvine",
        providerId: "4050",
        mediaType: "comic",
      }),
    ).resolves.toMatchObject({ success: true, code: "added" });

    await expect(readWatchlistDetail({ watchlistId: watchlist.id })).resolves.toMatchObject({
      items: [
        expect.objectContaining({ parentTitle: "Canonical Volume", title: "Canonical Issue" }),
      ],
    });
  });

  it("reports the inserted issue count for bulk ComicVine additions", async () => {
    const watchlist = await createTestWatchlist(db, { name: "Bulk comics" });
    process.env.COMICVINE_API_KEY = "test-comicvine-key";
    getComicVolumeDetailsMock.mockResolvedValue({ title: "Canonical Volume" });
    getComicIssuesMock.mockResolvedValue([
      {
        id: "issue-1",
        title: "Issue One",
        issueNumber: "1",
        poster: null,
        coverDate: "2012-03-14",
      },
      {
        id: "issue-2",
        title: "Issue Two",
        issueNumber: "2",
        poster: null,
        coverDate: "2012-04-14",
      },
      {
        id: "issue-3",
        title: "Issue Three",
        issueNumber: "3",
        poster: null,
        coverDate: "2012-05-14",
      },
    ]);

    const result = await addProviderMediaToWatchlist({
      watchlistId: watchlist.id,
      provider: "comicvine",
      providerId: "4050",
      mediaType: "comic",
    });

    expect(result).toEqual({
      success: true,
      code: "added",
      message: "Added 3 issues to watchlist",
      affectedCount: 3,
    });
  });

  it("reports a no-change outcome for a ComicVine volume with no issues", async () => {
    const watchlist = await createTestWatchlist(db, { name: "Repeated comics" });
    process.env.COMICVINE_API_KEY = "test-comicvine-key";
    getComicVolumeDetailsMock.mockResolvedValue({ title: "Canonical Volume" });
    getComicIssuesMock.mockResolvedValue([]);

    const result = await addProviderMediaToWatchlist({
      watchlistId: watchlist.id,
      provider: "comicvine",
      providerId: "4050",
      mediaType: "comic",
    });

    expect(result).toEqual({
      success: true,
      code: "no_new_episodes",
      message: "No issues found for this volume",
      affectedCount: 0,
    });
  });

  it("skips the volume lookup when the supplied media already has a title", async () => {
    const watchlist = await createTestWatchlist(db, { name: "Titled comics" });
    process.env.COMICVINE_API_KEY = "test-comicvine-key";
    getComicIssuesMock.mockResolvedValue([
      {
        id: "issue-1",
        title: "Canonical Issue",
        issueNumber: "1",
        poster: null,
        coverDate: "2012-03-14",
      },
    ]);

    const result = await addToWatchlistMutation({
      watchlistId: watchlist.id,
      media: {
        id: "4050",
        mediaType: "comic",
        source: "comicvine",
        title: "Search Result Volume",
        poster: null,
      },
    });
    const detail = await readWatchlistDetail({ watchlistId: watchlist.id });

    expect(result).toEqual({ success: true, message: "Added 1 issue to watchlist" });
    expect(getComicVolumeDetailsMock).not.toHaveBeenCalled();
    expect(detail?.items[0]).toMatchObject({
      parentTitle: "Search Result Volume",
      title: "Canonical Issue",
    });
  });

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

  it("returns a provider failure when a TV season cannot be resolved", async () => {
    const watchlist = await createTestWatchlist(db, { name: "Unavailable TV provider" });
    getTVDetailsMock.mockResolvedValue({
      name: "Unavailable Show",
      poster_path: null,
      seasons: [{ season_number: 1 }],
    });
    getSeasonDetailsMock.mockRejectedValue(new Error("TMDB unavailable"));

    await expect(
      addProviderMediaToWatchlist({
        watchlistId: watchlist.id,
        provider: "tmdb",
        providerId: "42",
        mediaType: "tv",
      }),
    ).resolves.toEqual({
      success: false,
      code: "provider_unavailable",
      message: "TMDB is temporarily unavailable. Please try again later.",
      affectedCount: 0,
    });
  });

  it("reports a show with no regular episodes as a zero-count outcome", async () => {
    const watchlist = await createTestWatchlist(db, { name: "Specials only" });
    getTVDetailsMock.mockResolvedValue({
      name: "Specials Only",
      poster_path: null,
      seasons: [{ season_number: 0 }],
    });

    const result = await addProviderMediaToWatchlist({
      watchlistId: watchlist.id,
      provider: "tmdb",
      providerId: "43",
      mediaType: "tv",
    });

    expect(result).toEqual({
      success: true,
      code: "no_new_episodes",
      message: "No episodes found for this show",
      affectedCount: 0,
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
      code: "unsupported",
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
