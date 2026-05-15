import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { createIsolatedTestDb, type IsolatedTestDb } from "@/test/isolated-db";
import { watchlistListQueryKey } from "./list/query";
import { WatchlistsRead } from "./read.server";

const dbState = vi.hoisted(() => ({
  db: undefined as IsolatedTestDb | undefined,
}));

vi.mock("@/db/db.server", () => ({
  getDb: () => dbState.db,
}));

let testDb: Awaited<ReturnType<typeof createIsolatedTestDb>>;
let db: IsolatedTestDb;
const { watchlists, watchlistItems } = schema;

beforeAll(async () => {
  testDb = await createIsolatedTestDb();
  db = testDb.db;
  dbState.db = db;
});

afterAll(() => {
  testDb.close();
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

describe("WatchlistsRead.homeScreen", () => {
  it("returns featured sections from next-unwatched items while keeping the full watchlist list", async () => {
    const [movieList] = await db
      .insert(watchlists)
      .values({
        name: "Movie Night",
        createdAt: "2024-01-01 00:00:00",
      })
      .returning();
    const [completedList] = await db
      .insert(watchlists)
      .values({
        name: "Finished Queue",
        createdAt: "2024-01-02 00:00:00",
      })
      .returning();

    await db.insert(watchlistItems).values([
      {
        watchlistId: movieList.id,
        tmdbId: "movie-1",
        source: "tmdb",
        mediaType: "movie",
        title: "Next Movie",
        releaseDate: "2024-02-01",
        isWatched: false,
      },
      {
        watchlistId: completedList.id,
        tmdbId: "movie-2",
        source: "tmdb",
        mediaType: "movie",
        title: "Done Movie",
        releaseDate: "2024-01-01",
        isWatched: true,
      },
    ]);

    const home = await WatchlistsRead.homeScreen();

    expect(home.featuredSections).toHaveLength(1);
    expect(home.featuredSections[0]).toMatchObject({
      key: "movie",
      title: "Movies",
    });
    expect(home.featuredSections[0]?.watchlists.map((watchlist) => watchlist.name)).toEqual([
      "Movie Night",
    ]);
    expect(home.allWatchlists.map((watchlist) => watchlist.name)).toEqual([
      "Movie Night",
      "Finished Queue",
    ]);
  });

  it("caps each media section at three watchlists and breaks stale ties by oldest created date", async () => {
    const insertedLists = await db
      .insert(watchlists)
      .values([
        {
          name: "Newest Created",
          createdAt: "2024-01-04 00:00:00",
        },
        {
          name: "Third Created",
          createdAt: "2024-01-03 00:00:00",
        },
        {
          name: "Second Created",
          createdAt: "2024-01-02 00:00:00",
        },
        {
          name: "Oldest Created",
          createdAt: "2024-01-01 00:00:00",
        },
      ])
      .returning();

    await db.insert(watchlistItems).values(
      insertedLists.map((watchlist, index) => ({
        watchlistId: watchlist.id,
        tmdbId: `movie-${index + 1}`,
        source: "tmdb" as const,
        mediaType: "movie" as const,
        title: `Movie ${index + 1}`,
        releaseDate: `2024-01-0${index + 1}`,
        isWatched: false,
      })),
    );

    const home = await WatchlistsRead.homeScreen();

    expect(home.featuredSections).toHaveLength(1);
    expect(home.featuredSections[0]?.watchlists.map((watchlist) => watchlist.name)).toEqual([
      "Oldest Created",
      "Second Created",
      "Third Created",
    ]);
    expect(home.allWatchlists.map((watchlist) => watchlist.name)).toEqual([
      "Oldest Created",
      "Second Created",
      "Third Created",
      "Newest Created",
    ]);
  });
});
