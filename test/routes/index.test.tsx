// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@test/utils/Render";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EnrichedWatchlist } from "@/features/watchlists/components/WatchlistCard";
import { WatchlistsHomeRouteContent } from "@/routes/watchlists.index";
import { WatchNow } from "@/features/lineups/read/WatchNow";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: unknown) => ({
    ...(config as object),
    useLoaderData: vi.fn(),
  }),
  Link: ({
    children,
    params,
    to,
    ...props
  }: {
    children: React.ReactNode;
    params?: { watchlistId?: string; lineupId?: string };
    to: string;
  }) => (
    <a
      href={to
        .replace("$watchlistId", params?.watchlistId ?? "")
        .replace("$lineupId", params?.lineupId ?? "")}
      data-watchlist-id={params?.watchlistId}
      {...props}
    >
      {children}
    </a>
  ),
}));

vi.mock("@/features/watchlists/components/WatchlistCard", () => ({
  WatchlistCard: ({
    watchlist,
    selectionMode = false,
    showUpNextBadge = true,
    infoVariant = "watchlist",
  }: {
    watchlist: EnrichedWatchlist;
    selectionMode?: boolean;
    showUpNextBadge?: boolean;
    infoVariant?: "watchlist" | "up-next";
  }) => (
    <div data-testid={`watchlist-card-${watchlist.id}`}>
      <span>{watchlist.name}</span>
      <span>{selectionMode ? "selection" : "browse"}</span>
      <span>{showUpNextBadge ? "badge" : "no-badge"}</span>
      <span>{infoVariant}</span>
    </div>
  ),
}));

vi.mock("@/features/watchlists/components/WatchlistFormDialog", () => ({
  WatchlistFormDialog: ({ trigger }: { trigger: React.ReactNode }) => <div>{trigger}</div>,
}));

vi.mock("@/features/watchlists/merge/MergeWatchlistDialog", () => ({
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
    pausedAt: overrides.pausedAt ?? null,
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

type HomeData = Parameters<typeof WatchlistsHomeRouteContent>[0]["initialData"];

function homeData(overrides?: Partial<HomeData>): HomeData {
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
        upcomingWatchlists: [],
      },
    ],
    allWatchlists: [featuredMovie, backlog],
    rotation: [featuredMovie, backlog],
    completed: [],
    paused: [],
    empty: [],
    ...overrides,
  };
}

describe("WatchlistsHomeRouteContent", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the My Lists administration page without featured sections", () => {
    render(<WatchlistsHomeRouteContent initialData={homeData()} />);

    expect(screen.getByRole("heading", { name: "My Lists" })).not.toBeNull();
    expect(screen.getByText("2 watchlists, 2 items")).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Up Next by Media" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Watchlists" })).not.toBeNull();
    expect(screen.getByTestId("watchlist-card-1").textContent).toContain("watchlist");
    expect(screen.getByTestId("watchlist-card-2").textContent).toContain("browse");
    expect(screen.queryByPlaceholderText("Find a list, movie, or show...")).toBeNull();
    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
  });

  it("renders completed, empty, and paused lists in collapsed sections below the rotation grid", () => {
    const finished = watchlist({
      id: 3,
      name: "Finished List",
      stats: {
        totalItems: 2,
        watchedItems: 2,
        progress: 100,
        nextUnwatched: null,
        coverImage: null,
        coverMediaType: null,
      },
    });
    const empty = watchlist({ id: 5, name: "Empty List", pausedAt: "2024-06-01 00:00:00" });
    const resting = watchlist({ id: 4, name: "Resting List", pausedAt: "2024-06-01 00:00:00" });

    render(
      <WatchlistsHomeRouteContent
        initialData={homeData({
          allWatchlists: [resting, finished, empty],
          rotation: [],
          completed: [finished],
          paused: [resting],
          empty: [empty],
        })}
      />,
    );

    expect(screen.getByRole("heading", { name: "Completed (1)" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Paused (1)" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Empty (1)" })).not.toBeNull();
    expect(screen.getByTestId("watchlist-card-5")).not.toBeNull();
    expect(screen.getByTestId("watchlist-card-3")).not.toBeNull();
    expect(screen.getByTestId("watchlist-card-4")).not.toBeNull();
  });

  it("hides featured sections and internal headings in selection mode", () => {
    render(<WatchlistsHomeRouteContent initialData={homeData()} />);

    fireEvent.click(screen.getByRole("button", { name: "Select watchlists" }));

    expect(screen.getByRole("heading", { name: "0 Selected" })).not.toBeNull();
    expect(screen.queryByText("2 watchlists, 2 items")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Up Next by Media" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Watchlists" })).toBeNull();
    expect(screen.queryByText("Create New List")).toBeNull();
    expect(screen.getAllByText("selection")).toHaveLength(2);
  });
});

describe("Watch Now", () => {
  afterEach(cleanup);
  it("hides disabled and empty lineups and links custom lineups with more than six members", () => {
    const lists = Array.from({ length: 7 }, (_, index) =>
      watchlist({
        id: index + 1,
        name: `List ${index + 1}`,
        stats: {
          totalItems: 1,
          watchedItems: 0,
          progress: 0,
          nextUnwatched: nextUnwatchedFixture({ title: `Next ${index + 1}` }),
          coverImage: null,
          coverMediaType: "movie",
        },
      }),
    );
    const lineups: Parameters<typeof WatchNow>[0]["lineups"] = [
      {
        id: 7,
        kind: "custom",
        systemKey: null,
        name: "Friends",
        enabled: true,
        rank: 0,
        reference: { kind: "custom", id: 7 },
        configuredWatchlists: lists,
        eligibleWatchlists: lists,
        configuredCount: 7,
        eligibleCount: 7,
      },
      {
        id: 8,
        kind: "custom",
        systemKey: null,
        name: "Hidden",
        enabled: false,
        rank: 1,
        reference: { kind: "custom", id: 8 },
        configuredWatchlists: lists,
        eligibleWatchlists: lists,
        configuredCount: 7,
        eligibleCount: 7,
      },
      {
        id: 9,
        kind: "custom",
        systemKey: null,
        name: "Empty",
        enabled: true,
        rank: 2,
        reference: { kind: "custom", id: 9 },
        configuredWatchlists: [],
        eligibleWatchlists: [],
        configuredCount: 0,
        eligibleCount: 0,
      },
    ];
    render(<WatchNow lineups={lineups} />);
    expect(screen.getByRole("heading", { name: "Watch Now" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "Friends" }).getAttribute("href")).toBe(
      "/rotations/custom/7",
    );
    expect(screen.getByRole("link", { name: "View all" })).not.toBeNull();
    expect(screen.queryByText("Hidden")).toBeNull();
    expect(screen.queryByText("Empty")).toBeNull();
    expect(screen.getAllByTestId(/watchlist-card-/)).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Next 4" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "Next 6" })).not.toBeNull();
    expect(screen.queryByRole("link", { name: "Next 7" })).toBeNull();
  });
  it("offers recovery links when no lineup is visible", () => {
    render(<WatchNow lineups={[]} />);
    expect(screen.getByRole("link", { name: "Customize" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "View My Lists" })).not.toBeNull();
  });
});
