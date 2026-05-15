// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WatchlistHomeScreen } from "@/features/watchlists/home/query.server";
import type { EnrichedWatchlist } from "@/components/WatchlistCard";
import { WatchlistsHomeScreen } from "@/features/watchlists/home/screen";

vi.mock("@/components/WatchlistCard", () => ({
  WatchlistCard: ({
    watchlist,
    selectionMode = false,
    showDeleteButton = true,
    showUpNextBadge = true,
  }: {
    watchlist: EnrichedWatchlist;
    selectionMode?: boolean;
    showDeleteButton?: boolean;
    showUpNextBadge?: boolean;
  }) => (
    <div data-testid={`watchlist-card-${watchlist.id}`}>
      <span>{watchlist.name}</span>
      <span>{selectionMode ? "selection" : "browse"}</span>
      <span>{showDeleteButton ? "delete" : "no-delete"}</span>
      <span>{showUpNextBadge ? "badge" : "no-badge"}</span>
    </div>
  ),
}));

vi.mock("@/components/CreateWatchlistCard", () => ({
  CreateWatchlistCard: () => <div>Create Watchlist Card</div>,
}));

vi.mock("@/components/CreateWatchlistDialog", () => ({
  CreateWatchlistDialog: () => <div>Create Watchlist Dialog</div>,
}));

vi.mock("@/components/MergeWatchlistDialog", () => ({
  MergeWatchlistDialog: () => <div>Merge Watchlists Dialog</div>,
}));

function watchlist(
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
      nextUnwatched: null,
      coverImage: null,
      coverMediaType: null,
    },
  };
}

function homeData(overrides?: Partial<WatchlistHomeScreen>): WatchlistHomeScreen {
  const featuredMovie = watchlist({
    id: 1,
    name: "Movie Night",
    stats: {
      totalItems: 1,
      watchedItems: 0,
      progress: 0,
      nextUnwatched: {
        id: 1,
        watchlistId: 1,
        tmdbId: "movie-1",
        source: "tmdb",
        mediaType: "movie",
        title: "Next Movie",
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
  });
  const backlog = watchlist({ id: 2, name: "Backlog" });

  return {
    featuredSections: [
      {
        key: "movie",
        title: "Movies",
        watchlists: [featuredMovie],
      },
    ],
    allWatchlists: [featuredMovie, backlog],
    ...overrides,
  };
}

describe("WatchlistsHomeScreen", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders featured media sections above the full watchlist grid without dead search or settings controls", () => {
    render(<WatchlistsHomeScreen initialData={homeData()} />);

    expect(screen.getByRole("heading", { name: "My Lists" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Up Next by Media" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Movies" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "All Watchlists" })).not.toBeNull();
    expect(screen.queryByPlaceholderText("Find a list, movie, or show...")).toBeNull();
    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
  });

  it("hides featured sections and internal headings in selection mode", () => {
    render(<WatchlistsHomeScreen initialData={homeData()} />);

    fireEvent.click(screen.getByRole("button", { name: "Select watchlists" }));

    expect(screen.getByRole("heading", { name: "0 Selected" })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Up Next by Media" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "All Watchlists" })).toBeNull();
    expect(screen.queryByText("Create Watchlist Card")).toBeNull();
    expect(screen.queryByText("Create Watchlist Dialog")).toBeNull();
    expect(screen.getAllByText("selection")).toHaveLength(2);
  });
});
