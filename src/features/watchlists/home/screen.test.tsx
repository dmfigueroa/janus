// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WatchlistHomeScreen } from "@/features/watchlists/home/query.server";
import type { EnrichedWatchlist } from "@/components/WatchlistCard";
import { WatchlistsHomeScreen } from "@/features/watchlists/home/screen";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    to,
    ...props
  }: {
    children: React.ReactNode;
    params: { watchlistId: string };
    to: string;
  }) => (
    <a
      href={to.replace("$watchlistId", params.watchlistId)}
      data-watchlist-id={params.watchlistId}
      {...props}
    >
      {children}
    </a>
  ),
}));

vi.mock("@/components/WatchlistCard", () => ({
  WatchlistCard: ({
    watchlist,
    selectionMode = false,
    showDeleteButton = true,
    showUpNextBadge = true,
    showSkipButton = false,
    infoVariant = "watchlist",
  }: {
    watchlist: EnrichedWatchlist;
    selectionMode?: boolean;
    showDeleteButton?: boolean;
    showUpNextBadge?: boolean;
    showSkipButton?: boolean;
    infoVariant?: "watchlist" | "up-next";
  }) => (
    <div data-testid={`watchlist-card-${watchlist.id}`}>
      <span>{watchlist.name}</span>
      <span>{selectionMode ? "selection" : "browse"}</span>
      <span>{showDeleteButton ? "delete" : "no-delete"}</span>
      <span>{showUpNextBadge ? "badge" : "no-badge"}</span>
      <span>{showSkipButton ? "skip" : "no-skip"}</span>
      <span>{infoVariant}</span>
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

function nextUnwatchedFixture(
  overrides?: Partial<NonNullable<EnrichedWatchlist["stats"]["nextUnwatched"]>>,
): NonNullable<EnrichedWatchlist["stats"]["nextUnwatched"]> {
  return {
    id: overrides?.id ?? 1,
    watchlistId: overrides?.watchlistId ?? 1,
    tmdbId: overrides?.tmdbId ?? "movie-1",
    source: overrides?.source ?? "tmdb",
    mediaType: overrides?.mediaType ?? "movie",
    title: overrides?.title ?? "Next Movie",
    parentId: overrides?.parentId ?? null,
    parentTitle: overrides?.parentTitle ?? null,
    season: overrides?.season ?? null,
    episode: overrides?.episode ?? null,
    posterPath: overrides?.posterPath ?? null,
    releaseDate: overrides?.releaseDate ?? "2024-01-01",
    voteAverage: overrides?.voteAverage ?? null,
    runtime: overrides?.runtime ?? null,
    customRank: overrides?.customRank ?? null,
    isWatched: overrides?.isWatched ?? false,
    authors: overrides?.authors ?? null,
    addedAt: overrides?.addedAt ?? "2024-01-01 00:00:00",
  } as NonNullable<EnrichedWatchlist["stats"]["nextUnwatched"]>;
}

function homeData(overrides?: Partial<WatchlistHomeScreen>): WatchlistHomeScreen {
  const featuredMovie = watchlist({
    id: 1,
    name: "Movie Night",
    stats: {
      totalItems: 1,
      watchedItems: 0,
      progress: 0,
      nextUnwatched: nextUnwatchedFixture(),
      coverImage: null,
      coverMediaType: "movie",
    },
  });
  const backlog = watchlist({ id: 2, name: "Backlog" });

  return {
    totals: {
      watchlists: 2,
      items: 2,
    },
    featuredSections: [
      {
        key: "movie",
        title: "Movies",
        watchlists: [featuredMovie],
        incomingWatchlists: [],
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
    expect(screen.getByText("2 watchlists, 2 items")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Up Next by Media" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Movies" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "All Watchlists" })).not.toBeNull();
    expect(screen.getAllByTestId("watchlist-card-1")[0]?.textContent).toContain("skip");
    expect(screen.getAllByTestId("watchlist-card-1")[0]?.textContent).toContain("up-next");
    expect(screen.getAllByTestId("watchlist-card-1")[1]?.textContent).toContain("watchlist");
    expect(screen.getByTestId("watchlist-card-2").textContent).toContain("no-skip");
    expect(screen.queryByPlaceholderText("Find a list, movie, or show...")).toBeNull();
    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
  });

  it("hides featured sections and internal headings in selection mode", () => {
    render(<WatchlistsHomeScreen initialData={homeData()} />);

    fireEvent.click(screen.getByRole("button", { name: "Select watchlists" }));

    expect(screen.getByRole("heading", { name: "0 Selected" })).not.toBeNull();
    expect(screen.queryByText("2 watchlists, 2 items")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Up Next by Media" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "All Watchlists" })).toBeNull();
    expect(screen.queryByText("Create Watchlist Card")).toBeNull();
    expect(screen.queryByText("Create Watchlist Dialog")).toBeNull();
    expect(screen.getAllByText("selection")).toHaveLength(2);
  });

  it("renders incoming watchlist chips after the featured cards with explanatory copy", () => {
    const firstIncoming = watchlist({
      id: 3,
      name: "Incoming One",
      stats: {
        totalItems: 1,
        watchedItems: 0,
        progress: 0,
        nextUnwatched: nextUnwatchedFixture({
          id: 3,
          watchlistId: 3,
          title: "Arrival",
        }),
        coverImage: null,
        coverMediaType: "movie",
      },
    });
    const secondIncoming = watchlist({
      id: 4,
      name: "Incoming Two",
      stats: {
        totalItems: 1,
        watchedItems: 0,
        progress: 0,
        nextUnwatched: nextUnwatchedFixture({
          id: 4,
          watchlistId: 4,
          mediaType: "episode",
          parentTitle: "Arrow",
          title: "Open House",
          season: 2,
          episode: "4",
        }),
        coverImage: null,
        coverMediaType: "episode",
      },
    });

    render(
      <WatchlistsHomeScreen
        initialData={homeData({
          featuredSections: [
            {
              key: "movie",
              title: "Movies",
              watchlists: [watchlist({ id: 1, name: "Movie Night" })],
              incomingWatchlists: [firstIncoming, secondIncoming],
            },
          ],
        })}
      />,
    );

    const sectionHeading = screen.getByRole("heading", { name: "Movies" });
    const section = sectionHeading.parentElement;

    expect(section).not.toBeNull();
    expect(within(section!).getByText("Coming up after these")).not.toBeNull();
    expect(within(section!).getByRole("link", { name: "Arrival" })).not.toBeNull();
    expect(within(section!).getByRole("link", { name: "Arrow • S2:E4" })).not.toBeNull();
    expect(within(section!).getByTestId("watchlist-card-1")).not.toBeNull();
  });
});
