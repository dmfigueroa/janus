// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Provider } from "@/app/Provider";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WatchlistItem } from "@/db/Schema";
import type { WatchlistDetailQueryFilters } from "@/features/watchlists/detail/Query";
import type { WatchlistSummary } from "@/features/watchlists/list/Query";
import { TimelineItem } from "@/features/watchlists/components/TimelineItem";

const toggleWatchedMutate = vi.fn();
const toggleWatchedWithoutRecencyMutate = vi.fn();
const removeItemMutateAsync = vi.fn();
const removeParentMutateAsync = vi.fn();
const moveItemMutate = vi.fn();
const moveParentMutate = vi.fn();
const previewState = {
  data: undefined as { count: number; watchedCount: number } | undefined,
  isLoading: false,
  isError: false,
};
const watchlistListState = {
  data: [] as WatchlistSummary[],
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
    mutate: moveItemMutate,
  }),
}));

vi.mock("@/features/watchlists/move/useMoveWatchlistParent", () => ({
  useMoveWatchlistParentMutation: () => ({
    isPending: false,
    mutate: moveParentMutate,
  }),
}));

vi.mock("@/features/watchlists/move/useWatchlistListQuery", () => ({
  useWatchlistListQuery: () => watchlistListState,
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
  moveItemMutate.mockReset();
  moveParentMutate.mockReset();
  previewState.data = undefined;
  previewState.isLoading = false;
  previewState.isError = false;
  watchlistListState.data = [];
  watchlistListState.isLoading = false;
  watchlistListState.isError = false;
});

describe("TimelineItem watched actions", () => {
  it("renders a custom episode label verbatim", () => {
    renderTimelineItem({
      mediaType: "episode",
      source: "custom",
      parentId: "custom:local-series",
      parentTitle: "Local Series",
      season: null,
      episode: "S01E01",
    });

    expect(screen.getByText("S01E01")).not.toBeNull();
  });

  it("offers a quiet watched action for unwatched items and runs it immediately", async () => {
    renderTimelineItem();

    fireEvent.click(screen.getByRole("button", { name: "More actions for Standalone Movie" }));

    fireEvent.click(
      await screen.findByRole("button", { name: "Mark watched without updating list" }),
    );

    await waitFor(() => {
      expect(toggleWatchedWithoutRecencyMutate).toHaveBeenCalledTimes(1);
    });
    expect(toggleWatchedMutate).not.toHaveBeenCalled();
  });

  it("hides the quiet watched action for items that are already watched", async () => {
    renderTimelineItem({ isWatched: true });

    fireEvent.click(screen.getByRole("button", { name: "More actions for Standalone Movie" }));

    await screen.findByRole("button", { name: "Edit" });
    expect(screen.queryByRole("button", { name: "Mark watched without updating list" })).toBeNull();
  });
});

describe("TimelineItem removal actions", () => {
  it("confirms standalone item removal with its title", async () => {
    removeItemMutateAsync.mockResolvedValue({ success: true });
    renderTimelineItem();

    fireEvent.click(screen.getByRole("button", { name: "More actions for Standalone Movie" }));

    expect(await screen.findByRole("button", { name: "Remove item" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Remove group" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Remove item" }));

    const dialog = await screen.findByRole("alertdialog");

    expect(within(dialog).getByText(/This will remove/i)).not.toBeNull();
    expect(within(dialog).getByText("Standalone Movie")).not.toBeNull();

    await waitFor(() => {
      expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" }));
    });

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

    expect(await screen.findByRole("button", { name: "Remove episode" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Remove show" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Remove show" }));

    expect(await screen.findByText("Remove show?")).not.toBeNull();
    expect(
      screen.getByText("This will remove 3 items from Great Show, including 1 watched."),
    ).not.toBeNull();

    const dialog = await screen.findByRole("alertdialog");

    fireEvent.click(within(dialog).getByRole("button", { name: "Remove show" }));

    await waitFor(() => {
      expect(removeParentMutateAsync).toHaveBeenCalledTimes(1);
    });
  });

  it("retains the confirmation after failure and still allows cancellation", async () => {
    removeItemMutateAsync.mockRejectedValue(new Error("Removal failed"));
    renderTimelineItem();

    fireEvent.click(screen.getByRole("button", { name: "More actions for Standalone Movie" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove item" }));

    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove item" }));

    await waitFor(() => expect(removeItemMutateAsync).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("alertdialog")).not.toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });
});

describe("TimelineItem movement actions", () => {
  it("moves an item to a custom-ordered destination with the selected position", async () => {
    watchlistListState.data = createDestinationWatchlists();
    renderTimelineItem();

    fireEvent.click(screen.getByRole("button", { name: "More actions for Standalone Movie" }));
    fireEvent.click(await screen.findByRole("button", { name: "Move to..." }));

    const dialog = await screen.findByRole("dialog", { name: "Move to another watchlist" });
    expect(within(dialog).queryByText("Current list")).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: /Manual queue/ }));
    const beginningPosition = within(dialog).getByRole("radio", { name: "Beginning" });
    beginningPosition.click();
    await waitFor(() => expect(beginningPosition).toHaveProperty("checked", true));
    fireEvent.click(within(dialog).getByRole("button", { name: "Move" }));

    expect(moveItemMutate).toHaveBeenCalledWith(
      { destinationWatchlistId: 3, position: "beginning" },
      { onSuccess: expect.any(Function) },
    );

    moveItemMutate.mock.calls[0][1].onSuccess();
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Move to another watchlist" })).toBeNull(),
    );
  });

  it("shows the automatic-ordering notice and omits a manual position", async () => {
    watchlistListState.data = createDestinationWatchlists();
    renderTimelineItem();

    fireEvent.click(screen.getByRole("button", { name: "More actions for Standalone Movie" }));
    fireEvent.click(await screen.findByRole("button", { name: "Move to..." }));

    const dialog = await screen.findByRole("dialog", { name: "Move to another watchlist" });
    fireEvent.click(within(dialog).getByRole("button", { name: /Release queue/ }));

    expect(within(dialog).getByText(/ordered by release date/i)).not.toBeNull();
    expect(within(dialog).queryByRole("radio")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Move" }));

    expect(moveItemMutate).toHaveBeenCalledWith(
      { destinationWatchlistId: 2, position: undefined },
      { onSuccess: expect.any(Function) },
    );
  });
});

function renderTimelineItem(overrides: Partial<WatchlistItem> = {}) {
  render(
    <Provider>
      <TimelineItem item={{ ...baseItem, ...overrides }} activeFilters={activeFilters} />
    </Provider>,
  );
}

function createDestinationWatchlists(): WatchlistSummary[] {
  return [
    createWatchlistSummary({ id: 1, name: "Current list", itemOrderMode: "release" }),
    createWatchlistSummary({ id: 2, name: "Release queue", itemOrderMode: "release" }),
    createWatchlistSummary({ id: 3, name: "Manual queue", itemOrderMode: "custom" }),
  ];
}

function createWatchlistSummary({
  id,
  name,
  itemOrderMode,
}: Pick<WatchlistSummary, "id" | "name" | "itemOrderMode">): WatchlistSummary {
  return {
    id,
    name,
    itemOrderMode,
    description: null,
    createdAt: "2024-01-01 00:00:00",
    updatedAt: null,
    lastWatchedAt: null,
    lastItemAddedAt: null,
    pausedAt: null,
    stats: {
      totalItems: 1,
      watchedItems: 0,
      progress: 0,
      nextUnwatched: null,
      coverImage: null,
      coverMediaType: null,
    },
  };
}
