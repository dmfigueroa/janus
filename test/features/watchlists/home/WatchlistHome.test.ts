import { describe, expect, it } from "vitest";
import { buildWatchlistHome } from "@/features/watchlists/home/WatchlistHome";
import type { WatchlistSummary } from "@/features/watchlists/list/Query";

const nextUnwatchedMovieFixture: NonNullable<WatchlistSummary["stats"]["nextUnwatched"]> = {
  id: 1,
  watchlistId: 1,
  tmdbId: "movie-1",
  source: "tmdb",
  mediaType: "movie",
  title: "Next Movie",
  parentId: null,
  parentTitle: null,
  season: null,
  episode: null,
  posterPath: null,
  releaseDate: "2024-01-01",
  voteAverage: null,
  runtime: null,
  customRank: null,
  isWatched: false,
  authors: null,
  addedAt: "2024-01-01 00:00:00",
};

type SummaryOverrides = Partial<WatchlistSummary> & Pick<WatchlistSummary, "id" | "name">;

function watchlistSummary(overrides: SummaryOverrides): WatchlistSummary {
  const { stats, ...recordOverrides } = overrides;
  return {
    description: null,
    itemOrderMode: "release",
    createdAt: "2024-01-01 00:00:00",
    updatedAt: null,
    lastWatchedAt: null,
    lastItemAddedAt: null,
    pausedAt: null,
    ...recordOverrides,
    stats: stats ?? {
      totalItems: 1,
      watchedItems: 0,
      progress: 0,
      nextUnwatched: null,
      coverImage: null,
      coverMediaType: null,
    },
  };
}

function completedSummary(overrides: SummaryOverrides): WatchlistSummary {
  return watchlistSummary({
    ...overrides,
    stats: {
      totalItems: 2,
      watchedItems: 2,
      progress: 100,
      nextUnwatched: null,
      coverImage: "/cover.jpg",
      coverMediaType: "movie",
    },
  });
}

describe("buildWatchlistHome", () => {
  it("separates the rotation grid from completed and paused lists", () => {
    const home = buildWatchlistHome([
      watchlistSummary({ id: 1, name: "Active" }),
      completedSummary({ id: 2, name: "Finished" }),
      watchlistSummary({ id: 3, name: "Resting", pausedAt: "2024-06-01 00:00:00" }),
      completedSummary({ id: 4, name: "Finished While Paused", pausedAt: "2024-06-01 00:00:00" }),
    ]);

    expect(home.rotation.map((watchlist) => watchlist.name)).toEqual(["Active"]);
    expect(home.completed.map((watchlist) => watchlist.name)).toEqual([
      "Finished",
      "Finished While Paused",
    ]);
    expect(home.paused.map((watchlist) => watchlist.name)).toEqual(["Resting"]);
  });

  it("keeps every list in the section input order", () => {
    const home = buildWatchlistHome([
      watchlistSummary({ id: 1, name: "Second Active" }),
      watchlistSummary({ id: 2, name: "First Active" }),
      completedSummary({ id: 3, name: "Old Finished" }),
      completedSummary({ id: 4, name: "New Finished" }),
    ]);

    expect(home.rotation.map((watchlist) => watchlist.id)).toEqual([1, 2]);
    expect(home.completed.map((watchlist) => watchlist.id)).toEqual([3, 4]);
  });

  it("counts every list and item in the header totals", () => {
    const home = buildWatchlistHome([
      watchlistSummary({
        id: 1,
        name: "Active",
        stats: {
          totalItems: 4,
          watchedItems: 1,
          progress: 25,
          nextUnwatched: null,
          coverImage: null,
          coverMediaType: null,
        },
      }),
      completedSummary({ id: 2, name: "Finished" }),
      watchlistSummary({ id: 3, name: "Resting", pausedAt: "2024-06-01 00:00:00" }),
    ]);

    expect(home.totals).toEqual({ watchlists: 3, items: 7 });
    expect(home.allWatchlists).toHaveLength(3);
  });

  it("builds featured media sections and upcoming chips from rotation lists only", () => {
    const activeMovieLists = [1, 2, 3, 4].map((id) =>
      watchlistSummary({
        id,
        name: `Movie List ${id}`,
        stats: {
          totalItems: 3,
          watchedItems: 1,
          progress: 33,
          nextUnwatched: { ...nextUnwatchedMovieFixture, id: id, watchlistId: id },
          coverImage: "/cover.jpg",
          coverMediaType: "movie",
        },
      }),
    );
    const pausedMovieList = watchlistSummary({
      id: 5,
      name: "Paused Movie List",
      pausedAt: "2024-06-01 00:00:00",
      stats: {
        totalItems: 3,
        watchedItems: 1,
        progress: 33,
        nextUnwatched: { ...nextUnwatchedMovieFixture, id: 5, watchlistId: 5 },
        coverImage: "/cover.jpg",
        coverMediaType: "movie",
      },
    });

    const home = buildWatchlistHome([...activeMovieLists, pausedMovieList]);

    const movieSection = home.featuredSections.find((section) => section.key === "movie");
    expect(movieSection?.watchlists.map((watchlist) => watchlist.id)).toEqual([1, 2, 3]);
    expect(movieSection?.upcomingWatchlists.map((watchlist) => watchlist.id)).toEqual([4]);
  });

  it("keeps a nearly finished list in the rotation despite rounded progress", () => {
    const almostFinished = watchlistSummary({
      id: 5,
      name: "Almost Finished",
      stats: {
        totalItems: 200,
        watchedItems: 199,
        progress: 100,
        nextUnwatched: { ...nextUnwatchedMovieFixture, id: 5, watchlistId: 5 },
        coverImage: null,
        coverMediaType: "movie",
      },
    });

    const home = buildWatchlistHome([almostFinished]);

    expect(home.rotation.map((watchlist) => watchlist.id)).toEqual([5]);
    expect(home.completed).toEqual([]);
  });

  it("keeps an empty watchlist out of the completed section", () => {
    const empty = watchlistSummary({
      id: 6,
      name: "Empty",
      stats: {
        totalItems: 0,
        watchedItems: 0,
        progress: 0,
        nextUnwatched: null,
        coverImage: null,
        coverMediaType: null,
      },
    });

    const home = buildWatchlistHome([empty]);

    expect(home.rotation).toEqual([]);
    expect(home.empty.map((watchlist) => watchlist.id)).toEqual([6]);
    expect(home.completed).toEqual([]);
  });
});
