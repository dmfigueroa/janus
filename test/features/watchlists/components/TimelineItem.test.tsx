// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Provider } from "@/app/Provider";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WatchlistItem } from "@/db/Schema";
import type { WatchlistDetailQueryFilters } from "@/features/watchlists/detail/Query";
import { TimelineItem } from "@/features/watchlists/components/TimelineItem";

const toggleWatchedMutate = vi.fn();
const toggleWatchedWithoutRecencyMutate = vi.fn();
const removeItemMutateAsync = vi.fn();
const removeParentMutateAsync = vi.fn();
const previewState = {
  data: undefined as { count: number; watchedCount: number } | undefined,
  isLoading: false,
  isError: false,
};
const activeFilters: WatchlistDetailQueryFilters = {
  watchlistId: 1,
  itemOrderMode: "release",
  unwatchedOnly: false,
  query: "",
};
const baseItem: WatchlistItem = {
  id: 1,
  watchlistId: 1,
  tmdbId: "1",
  source: "tmdb",
  mediaType: "movie",
  title: "Standalone Movie",
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

vi.mock("@/features/watchlists/detail/useToggleWatchedItem", () => ({
  useToggleWatchedItem: (_item: WatchlistItem, options?: { updateWatchlistRecency?: boolean }) => ({
    isPending: false,
    mutate:
      options?.updateWatchlistRecency === false
        ? toggleWatchedWithoutRecencyMutate
        : toggleWatchedMutate,
  }),
}));

vi.mock("@/features/watchlists/remove/useRemoveWatchlistItem", () => ({
  useRemoveWatchlistItemMutation: () => ({
    isPending: false,
    mutateAsync: removeItemMutateAsync,
  }),
}));

vi.mock("@/features/watchlists/remove/useRemoveWatchlistParent", () => ({
  useRemoveWatchlistParentMutation: () => ({
    isPending: false,
    mutateAsync: removeParentMutateAsync,
  }),
}));

vi.mock("@/features/watchlists/move/useMoveWatchlistItem", () => ({
  useMoveWatchlistItemMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
}));

vi.mock("@/features/watchlists/move/useMoveWatchlistParent", () => ({
  useMoveWatchlistParentMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
}));

vi.mock("@/features/watchlists/components/EditWatchlistItemDialog", () => ({
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

describe("TimelineItem watched actions", () => {
  it("offers a quiet watched action for unwatched items and runs it immediately", async () => {
    renderTimelineItem();

    fireEvent.click(screen.getByRole("button", { name: "More actions for Standalone Movie" }));

    fireEvent.click(screen.getByRole("button", { name: "Mark watched without updating list" }));

    await waitFor(() => {
      expect(toggleWatchedWithoutRecencyMutate).toHaveBeenCalledTimes(1);
    });
    expect(toggleWatchedMutate).not.toHaveBeenCalled();
  });

  it("hides the quiet watched action for items that are already watched", () => {
    renderTimelineItem({ isWatched: true });

    fireEvent.click(screen.getByRole("button", { name: "More actions for Standalone Movie" }));

    expect(screen.queryByRole("button", { name: "Mark watched without updating list" })).toBeNull();
  });
});

describe("TimelineItem removal actions", () => {
  it("confirms standalone item removal with its title", async () => {
    removeItemMutateAsync.mockResolvedValue({ success: true });
    renderTimelineItem();

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

  it("includes grouped-item preview counts in parent removal", async () => {
    previewState.data = { count: 3, watchedCount: 1 };
    removeParentMutateAsync.mockResolvedValue({ success: true });
    renderTimelineItem({
      id: 2,
      title: "Pilot",
      mediaType: "episode",
      parentId: "tmdb:42",
      parentTitle: "Great Show",
    });

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

function renderTimelineItem(overrides: Partial<WatchlistItem> = {}) {
  render(
    <Provider>
      <TimelineItem item={{ ...baseItem, ...overrides }} activeFilters={activeFilters} />
    </Provider>,
  );
}
