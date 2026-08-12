// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WatchlistItem } from "@/db/schema";
import { TimelineItem } from "./timeline-item";

const toggleWatchedMutate = vi.fn();
const toggleWatchedWithoutRecencyMutate = vi.fn();
const removeItemMutateAsync = vi.fn();
const removeParentMutateAsync = vi.fn();
const previewState = {
  data: undefined as { count: number; watchedCount: number } | undefined,
  isLoading: false,
  isError: false,
};

vi.mock("@/features/watchlists/detail/use-toggle-watched-item", () => ({
  useToggleWatchedItem: (_item: WatchlistItem, options?: { updateWatchlistRecency?: boolean }) => ({
    isPending: false,
    mutate:
      options?.updateWatchlistRecency === false
        ? toggleWatchedWithoutRecencyMutate
        : toggleWatchedMutate,
  }),
}));

vi.mock("@/features/watchlists/remove/use-remove-watchlist-item", () => ({
  useRemoveWatchlistItemMutation: () => ({
    isPending: false,
    mutateAsync: removeItemMutateAsync,
  }),
}));

vi.mock("@/features/watchlists/remove/use-remove-watchlist-parent", () => ({
  useRemoveWatchlistParentMutation: () => ({
    isPending: false,
    mutateAsync: removeParentMutateAsync,
  }),
}));

vi.mock("@/features/watchlists/move/use-move-watchlist-item", () => ({
  useMoveWatchlistItemMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
}));

vi.mock("@/features/watchlists/move/use-move-watchlist-parent", () => ({
  useMoveWatchlistParentMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
}));

vi.mock("./edit-watchlist-item-dialog", () => ({
  EditWatchlistItemDialog: () => null,
}));

vi.mock("@tanstack/react-query", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");

  return {
    ...actual,
    useQuery: () => previewState,
  };
});

vi.mock("@tanstack/react-start", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-start")>("@tanstack/react-start");

  return {
    ...actual,
    useServerFn: () => vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  toggleWatchedMutate.mockReset();
  toggleWatchedWithoutRecencyMutate.mockReset();
  removeItemMutateAsync.mockReset();
  removeParentMutateAsync.mockReset();
  previewState.data = undefined;
  previewState.isLoading = false;
  previewState.isError = false;
});

describe("TimelineItem removal actions", () => {
  it("offers a quiet watched action for unwatched items and runs it immediately", async () => {
    render(
      <TimelineItem
        item={createItem({ id: 1, title: "Standalone Movie", mediaType: "movie", parentId: null })}
        activeFilters={{
          watchlistId: 1,
          itemOrderMode: "release",
          unwatchedOnly: false,
          query: "",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "More actions for Standalone Movie" }));

    fireEvent.click(screen.getByRole("button", { name: "Mark watched without updating list" }));

    await waitFor(() => {
      expect(toggleWatchedWithoutRecencyMutate).toHaveBeenCalledTimes(1);
    });
    expect(toggleWatchedMutate).not.toHaveBeenCalled();
  });

  it("hides the quiet watched action for items that are already watched", () => {
    render(
      <TimelineItem
        item={createItem({
          id: 1,
          title: "Standalone Movie",
          mediaType: "movie",
          parentId: null,
          isWatched: true,
        })}
        activeFilters={{
          watchlistId: 1,
          itemOrderMode: "release",
          unwatchedOnly: false,
          query: "",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "More actions for Standalone Movie" }));

    expect(screen.queryByRole("button", { name: "Mark watched without updating list" })).toBeNull();
  });

  it("shows only single-item removal for standalone items and confirms with the item title", async () => {
    removeItemMutateAsync.mockResolvedValue({ success: true });

    render(
      <TimelineItem
        item={createItem({ id: 1, title: "Standalone Movie", mediaType: "movie", parentId: null })}
        activeFilters={{
          watchlistId: 1,
          itemOrderMode: "release",
          unwatchedOnly: false,
          query: "",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "More actions for Standalone Movie" }));

    expect(screen.getByRole("button", { name: "Remove item" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Remove group" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Remove item" }));

    const dialog = screen.getByRole("alertdialog");

    expect(within(dialog).getByText(/This will remove/i)).not.toBeNull();
    expect(within(dialog).getByText("Standalone Movie")).not.toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Remove item" }));

    await waitFor(() => {
      expect(removeItemMutateAsync).toHaveBeenCalledTimes(1);
    });
  });

  it("shows parent removal for grouped episodes and includes preview counts in the confirmation", async () => {
    previewState.data = { count: 3, watchedCount: 1 };
    removeParentMutateAsync.mockResolvedValue({ success: true });

    render(
      <TimelineItem
        item={createItem({
          id: 2,
          title: "Pilot",
          mediaType: "episode",
          parentId: "tmdb:42",
          parentTitle: "Great Show",
        })}
        activeFilters={{
          watchlistId: 1,
          itemOrderMode: "release",
          unwatchedOnly: false,
          query: "",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "More actions for Pilot" }));

    expect(screen.getByRole("button", { name: "Remove episode" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Remove show" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Remove show" }));

    expect(screen.getByText("Remove show?")).not.toBeNull();
    expect(
      screen.getByText("This will remove 3 items from Great Show, including 1 watched."),
    ).not.toBeNull();

    const dialog = screen.getByRole("alertdialog");

    fireEvent.click(within(dialog).getByRole("button", { name: "Remove show" }));

    await waitFor(() => {
      expect(removeParentMutateAsync).toHaveBeenCalledTimes(1);
    });
  });
});

function createItem({
  id,
  title,
  mediaType,
  parentId,
  parentTitle = null,
  isWatched = false,
}: {
  id: number;
  title: string;
  mediaType: WatchlistItem["mediaType"];
  parentId: string | null;
  parentTitle?: string | null;
  isWatched?: boolean;
}): WatchlistItem {
  return {
    id,
    watchlistId: 1,
    tmdbId: String(id),
    source: mediaType === "comic" ? "comicvine" : "tmdb",
    mediaType,
    title,
    parentId,
    parentTitle,
    season: null,
    episode: null,
    posterPath: null,
    releaseDate: "2024-01-01",
    voteAverage: null,
    runtime: null,
    customRank: null,
    isWatched,
    authors: null,
    addedAt: "2024-01-01 00:00:00",
  };
}
