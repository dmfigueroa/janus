// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EnrichedWatchlist } from "./WatchlistCard";
import { WatchlistCard } from "./WatchlistCard";

const {
  invalidateMock,
  deleteWatchlistFnMock,
  skipWatchlistFnMock,
  deleteWatchlistServerFn,
  skipWatchlistServerFn,
} = vi.hoisted(() => ({
  invalidateMock: vi.fn(),
  deleteWatchlistFnMock: vi.fn(),
  skipWatchlistFnMock: vi.fn(),
  deleteWatchlistServerFn: Symbol("deleteWatchlist"),
  skipWatchlistServerFn: Symbol("skipWatchlist"),
}));

vi.mock("@/features/watchlists/delete/mutation", () => ({
  deleteWatchlist: deleteWatchlistServerFn,
}));

vi.mock("@/features/watchlists/skip/mutation", () => ({
  skipWatchlist: skipWatchlistServerFn,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) => (
    <a {...props}>{children}</a>
  ),
  useRouter: () => ({
    invalidate: invalidateMock,
  }),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (serverFn: symbol) => {
    if (serverFn === deleteWatchlistServerFn) {
      return deleteWatchlistFnMock;
    }
    if (serverFn === skipWatchlistServerFn) {
      return skipWatchlistFnMock;
    }

    return vi.fn();
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("./DeleteWatchlistButton", () => ({
  DeleteWatchlistButton: () => <div>Delete button</div>,
}));

function createWatchlist(
  overrides: Partial<EnrichedWatchlist> & Pick<EnrichedWatchlist, "id" | "name">,
): EnrichedWatchlist {
  return {
    id: overrides.id,
    name: overrides.name,
    description: overrides.description ?? null,
    itemOrderMode: overrides.itemOrderMode ?? "release",
    createdAt: overrides.createdAt ?? "2024-01-01 00:00:00",
    updatedAt: overrides.updatedAt ?? null,
    lastWatchedAt: overrides.lastWatchedAt ?? null,
    lastItemAddedAt: overrides.lastItemAddedAt ?? null,
    stats: overrides.stats ?? {
      totalItems: 1,
      watchedItems: 0,
      progress: 0,
      nextUnwatched: {
        id: 10,
        watchlistId: overrides.id,
        tmdbId: "movie-10",
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
      },
      coverImage: null,
      coverMediaType: "movie",
    },
  };
}

describe("WatchlistCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    skipWatchlistFnMock.mockResolvedValue({ success: true });
    deleteWatchlistFnMock.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    cleanup();
  });

  it("skips an up next watchlist and invalidates the route data", async () => {
    render(
      <WatchlistCard
        watchlist={createWatchlist({ id: 1, name: "Movie Night" })}
        showDeleteButton={false}
        showUpNextBadge={false}
        showSkipButton
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Skip Movie Night" }));

    await waitFor(() => {
      expect(skipWatchlistFnMock).toHaveBeenCalledWith({
        data: { watchlistId: 1 },
      });
    });
    expect(invalidateMock).toHaveBeenCalled();
  });

  it("shows item titles instead of the watchlist name in featured up next cards", () => {
    render(
      <WatchlistCard
        watchlist={createWatchlist({
          id: 1,
          name: "Movie Night",
          stats: {
            totalItems: 3,
            watchedItems: 1,
            progress: 33,
            nextUnwatched: {
              id: 10,
              watchlistId: 1,
              tmdbId: "episode-10",
              source: "tmdb",
              mediaType: "episode",
              title: "The Test Episode",
              parentId: null,
              parentTitle: "Prestige TV",
              season: 2,
              episode: "5",
              posterPath: null,
              releaseDate: "2024-01-01",
              voteAverage: null,
              runtime: null,
              customRank: null,
              isWatched: false,
              authors: null,
              addedAt: "2024-01-01 00:00:00",
            },
            coverImage: null,
            coverMediaType: "episode",
          },
        })}
        showDeleteButton={false}
        showUpNextBadge={false}
        infoVariant="up-next"
      />,
    );

    expect(screen.getByRole("heading", { name: "Prestige TV" })).not.toBeNull();
    expect(screen.getByText("S2:E5 • The Test Episode")).not.toBeNull();
    expect(screen.queryByText("Movie Night")).toBeNull();
  });

  it("omits watchlist stats and progress details in featured up next cards", () => {
    render(
      <WatchlistCard
        watchlist={createWatchlist({
          id: 1,
          name: "Movie Night",
          stats: {
            totalItems: 3,
            watchedItems: 1,
            progress: 33,
            nextUnwatched: {
              id: 10,
              watchlistId: 1,
              tmdbId: "movie-10",
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
            },
            coverImage: null,
            coverMediaType: "movie",
          },
        })}
        showDeleteButton={false}
        showUpNextBadge={false}
        infoVariant="up-next"
      />,
    );

    expect(screen.queryByText("3 items")).toBeNull();
    expect(screen.queryByText("33%")).toBeNull();
  });

  it("formats comic numbering ahead of the item title in featured up next cards", () => {
    render(
      <WatchlistCard
        watchlist={createWatchlist({
          id: 1,
          name: "Comic Night",
          stats: {
            totalItems: 12,
            watchedItems: 5,
            progress: 42,
            nextUnwatched: {
              id: 10,
              watchlistId: 1,
              tmdbId: "comic-10",
              source: "comicvine",
              mediaType: "comic",
              title: "The Trial",
              parentId: null,
              parentTitle: "Saga",
              season: null,
              episode: "Issue 12",
              posterPath: null,
              releaseDate: "2024-01-01",
              voteAverage: null,
              runtime: null,
              customRank: null,
              isWatched: false,
              authors: null,
              addedAt: "2024-01-01 00:00:00",
            },
            coverImage: null,
            coverMediaType: "comic",
          },
        })}
        showDeleteButton={false}
        showUpNextBadge={false}
        infoVariant="up-next"
      />,
    );

    expect(screen.getByRole("heading", { name: "Saga" })).not.toBeNull();
    expect(screen.getByText("Issue 12 • The Trial")).not.toBeNull();
  });
});
