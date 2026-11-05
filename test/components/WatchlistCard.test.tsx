// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@test/utils/Render";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EnrichedWatchlist } from "@/features/watchlists/components/WatchlistCard";
import { WatchlistCard } from "@/features/watchlists/components/WatchlistCard";

const {
  invalidateMock,
  deleteWatchlistFnMock,
  skipWatchlistFnMock,
  pauseWatchlistFnMock,
  resumeWatchlistFnMock,
  deleteWatchlistServerFn,
  skipWatchlistServerFn,
  pauseWatchlistServerFn,
  resumeWatchlistServerFn,
} = vi.hoisted(() => ({
  invalidateMock: vi.fn(),
  deleteWatchlistFnMock: vi.fn(),
  skipWatchlistFnMock: vi.fn(),
  pauseWatchlistFnMock: vi.fn(),
  resumeWatchlistFnMock: vi.fn(),
  deleteWatchlistServerFn: Symbol("deleteWatchlist"),
  skipWatchlistServerFn: Symbol("skipWatchlist"),
  pauseWatchlistServerFn: Symbol("pauseWatchlist"),
  resumeWatchlistServerFn: Symbol("resumeWatchlist"),
}));

vi.mock("@/features/watchlists/delete/Mutation", () => ({
  deleteWatchlist: deleteWatchlistServerFn,
}));

vi.mock("@/features/watchlists/skip/Mutation", () => ({
  skipWatchlist: skipWatchlistServerFn,
}));

vi.mock("@/features/watchlists/pause/PauseWatchlist", () => ({
  pauseWatchlist: pauseWatchlistServerFn,
  resumeWatchlist: resumeWatchlistServerFn,
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
    if (serverFn === pauseWatchlistServerFn) {
      return pauseWatchlistFnMock;
    }
    if (serverFn === resumeWatchlistServerFn) {
      return resumeWatchlistFnMock;
    }

    return vi.fn();
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/app/Toaster", () => ({ toaster: { create: vi.fn() } }));

vi.mock("@/features/watchlists/components/DeleteWatchlistDialog", () => ({
  DeleteWatchlistDialog: ({ open }: { open: boolean }) =>
    open ? <div>Delete confirmation dialog</div> : null,
}));

type NextUnwatchedFixture = NonNullable<EnrichedWatchlist["stats"]["nextUnwatched"]>;

function nextUnwatchedFixture(
  watchlistId: number,
  overrides?: { mediaType?: NextUnwatchedFixture["mediaType"] },
): NextUnwatchedFixture {
  return {
    id: 10,
    watchlistId,
    tmdbId: "movie-10",
    source: "tmdb",
    mediaType: overrides?.mediaType ?? "movie",
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
}

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
    pausedAt: overrides.pausedAt ?? null,
    stats: overrides.stats ?? {
      totalItems: 1,
      watchedItems: 0,
      progress: 0,
      nextUnwatched: nextUnwatchedFixture(overrides.id),
      coverImage: null,
      coverMediaType: "movie",
    },
  };
}

async function openCardMenu(watchlistName: string) {
  fireEvent.click(screen.getByRole("button", { name: `Watchlist actions for ${watchlistName}` }));
  await waitFor(() => {
    expect(screen.getByRole("menu")).not.toBeNull();
  });
}

describe("WatchlistCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    skipWatchlistFnMock.mockResolvedValue({ success: true });
    deleteWatchlistFnMock.mockResolvedValue({ success: true });
    pauseWatchlistFnMock.mockResolvedValue({ success: true });
    resumeWatchlistFnMock.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    cleanup();
  });

  it("skips an up next watchlist from the card menu and invalidates the route data", async () => {
    render(
      <WatchlistCard
        watchlist={createWatchlist({ id: 1, name: "Movie Night" })}
        showUpNextBadge={false}
      />,
    );

    await openCardMenu("Movie Night");
    fireEvent.click(screen.getByRole("menuitem", { name: "Skip" }));

    await waitFor(() => {
      expect(skipWatchlistFnMock).toHaveBeenCalledWith({
        data: { watchlistId: 1 },
      });
    });
    expect(invalidateMock).toHaveBeenCalled();
  });

  it("pauses a watchlist from the card menu and invalidates the route data", async () => {
    render(
      <WatchlistCard
        watchlist={createWatchlist({ id: 1, name: "Movie Night" })}
        showUpNextBadge={false}
      />,
    );

    await openCardMenu("Movie Night");
    fireEvent.click(screen.getByRole("menuitem", { name: "Pause" }));

    await waitFor(() => {
      expect(pauseWatchlistFnMock).toHaveBeenCalledWith({
        data: { watchlistId: 1 },
      });
    });
    expect(invalidateMock).toHaveBeenCalled();
  });

  it("resumes a paused watchlist from the card menu", async () => {
    render(
      <WatchlistCard
        watchlist={createWatchlist({ id: 1, name: "Movie Night", pausedAt: "2024-06-01 00:00:00" })}
        showUpNextBadge={false}
      />,
    );

    await openCardMenu("Movie Night");
    fireEvent.click(screen.getByRole("menuitem", { name: "Resume" }));

    await waitFor(() => {
      expect(resumeWatchlistFnMock).toHaveBeenCalledWith({
        data: { watchlistId: 1 },
      });
    });
    expect(invalidateMock).toHaveBeenCalled();
  });

  it("offers skip only when a next unwatched item exists", async () => {
    render(
      <WatchlistCard
        watchlist={createWatchlist({
          id: 1,
          name: "Movie Night",
          stats: {
            totalItems: 1,
            watchedItems: 1,
            progress: 100,
            nextUnwatched: null,
            coverImage: null,
            coverMediaType: null,
          },
        })}
        showUpNextBadge={false}
      />,
    );

    await openCardMenu("Movie Night");

    expect(screen.queryByRole("menuitem", { name: "Skip" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Pause" })).not.toBeNull();
  });

  it("opens the delete confirmation dialog from the card menu", async () => {
    render(
      <WatchlistCard
        watchlist={createWatchlist({ id: 1, name: "Movie Night" })}
        showUpNextBadge={false}
      />,
    );

    await openCardMenu("Movie Night");
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

    expect(screen.getByText("Delete confirmation dialog")).not.toBeNull();
  });

  it("marks the card wrapper as a group for hover actions", () => {
    render(
      <WatchlistCard
        watchlist={createWatchlist({ id: 1, name: "Movie Night" })}
        showUpNextBadge={false}
      />,
    );

    const cardWrapper = screen.getByRole("group");
    expect(cardWrapper).not.toBeNull();
    expect(cardWrapper.className).toContain("group");
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
            nextUnwatched: nextUnwatchedFixture(1, { mediaType: "episode" }),
            coverImage: null,
            coverMediaType: "episode",
          },
        })}
        showUpNextBadge={false}
        infoVariant="up-next"
      />,
    );

    expect(screen.getByRole("heading", { name: "Next Movie" })).not.toBeNull();
    expect(screen.queryByText("Movie Night")).toBeNull();
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
              ...nextUnwatchedFixture(1),
              tmdbId: "comic-10",
              source: "comicvine",
              mediaType: "comic",
              title: "The Trial",
              parentTitle: "Saga",
              episode: "Issue 12",
            },
            coverImage: null,
            coverMediaType: "comic",
          },
        })}
        showUpNextBadge={false}
        infoVariant="up-next"
      />,
    );

    expect(screen.getByRole("heading", { name: "Saga" })).not.toBeNull();
    expect(screen.getByText("Issue 12 • The Trial")).not.toBeNull();
  });

  it("exposes whether a watchlist is selected to assistive technology", () => {
    const { rerender } = render(
      <WatchlistCard
        watchlist={createWatchlist({ id: 1, name: "Movie Night" })}
        selectionMode
        isSelected={false}
      />,
    );

    const selectionButton = screen.getByRole("button", { name: "Select Movie Night" });
    expect(selectionButton.getAttribute("aria-pressed")).toBe("false");

    rerender(
      <WatchlistCard
        watchlist={createWatchlist({ id: 1, name: "Movie Night" })}
        selectionMode
        isSelected
      />,
    );

    const selectedButton = screen.getByRole("button", { name: "Deselect Movie Night" });
    expect(selectedButton.getAttribute("aria-pressed")).toBe("true");
  });

  it("lets keyboard users select a watchlist from selection mode", () => {
    const onToggle = vi.fn();

    render(
      <WatchlistCard
        watchlist={createWatchlist({ id: 1, name: "Movie Night" })}
        selectionMode
        onToggle={onToggle}
      />,
    );

    const selectionButton = screen.getByRole("button", { name: "Select Movie Night" });
    selectionButton.focus();
    fireEvent.click(selectionButton);

    expect(document.activeElement).toBe(selectionButton);
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
