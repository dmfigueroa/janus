// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChakraProvider } from "@chakra-ui/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WatchlistItem } from "@/db/Schema";
import type { WatchlistSummary } from "@/features/watchlists/list/Query.server";
import {
  getWatchlistDetailPage,
  watchlistDetailQueryKey,
  type WatchlistDetailPage,
} from "@/features/watchlists/detail/Query";
import { WatchlistDetailScreen } from "@/features/watchlists/detail/Screen";
import { janusSystem } from "@/app/Theme";
const mocks = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn() }));
vi.mock("@tanstack/react-start", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-start")>()),
  useServerFn: (serverFunction: unknown) =>
    serverFunction === getWatchlistDetailPage ? mocks.read : mocks.save,
}));
vi.mock("@/features/watchlists/detail/Query.server", () => ({ getWatchlistDetail: vi.fn() }));
vi.mock("@/features/watchlists/reorder/Mutation", () => ({ reorderWatchlistItems: vi.fn() }));
vi.mock("@/app/Toaster", () => ({ toaster: { create: vi.fn() } }));
vi.mock("@/features/watchlists/detail/useDeleteWatchlistDetail", () => ({
  useDeleteWatchlistDetail: () => ({
    deleteOpen: false,
    setDeleteOpen: vi.fn(),
    deleting: false,
    handleDelete: vi.fn(),
  }),
}));
vi.mock("@/features/watchlists/pause/useToggleWatchlistPause", () => ({
  useToggleWatchlistPause: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/features/watchlists/components/DeleteWatchlistDialog", () => ({
  DeleteWatchlistDialog: () => null,
}));
vi.mock("@/features/watchlists/components/WatchlistHeader", () => ({
  WatchlistHeader: ({
    onSearchChange,
    onFilterChange,
  }: {
    onSearchChange: (value: string) => void;
    onFilterChange: (value: boolean) => void;
  }) => (
    <div>
      <button onClick={() => onSearchChange("match")}>Search</button>
      <button onClick={() => onFilterChange(false)}>All items</button>
    </div>
  ),
}));
vi.mock("@/features/watchlists/components/WatchlistTimeline", () => ({
  WatchlistTimeline: ({
    items,
    onReorder,
    interactionDisabled,
  }: {
    items: WatchlistItem[];
    onReorder: (intent: {
      movedItemId: number;
      referenceItemId: number;
      position: "after";
    }) => void;
    interactionDisabled: boolean;
  }) => (
    <div>
      <output>{items.map((item) => item.id).join(",")}</output>
      <button
        disabled={interactionDisabled}
        onClick={() => onReorder({ movedItemId: 1, referenceItemId: 2, position: "after" })}
      >
        Reorder
      </button>
    </div>
  ),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("custom timeline optimistic query identity", () => {
  it.each(["initial", "search", "all items"])(
    "updates the rendered cache before save completes: %s",
    async (filter) => {
      const initialData = createPage({
        itemOrderMode: "custom",
        items: [
          createItem({ id: 1, title: "First", customRank: 1 }),
          createItem({ id: 2, title: "Second", customRank: 2 }),
        ],
      });
      const client = new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: Infinity },
          mutations: { retry: false },
        },
      });
      client.setQueryData(
        watchlistDetailQueryKey({ watchlistId: 1, itemOrderMode: "custom", unwatchedOnly: false }),
        { pages: [initialData], pageParams: [1] },
      );
      mocks.read.mockResolvedValue(initialData);
      mocks.save.mockReturnValue(new Promise(() => {}));
      render(
        <ChakraProvider value={janusSystem}>
          <QueryClientProvider client={client}>
            <WatchlistDetailScreen initialData={initialData} />
          </QueryClientProvider>
        </ChakraProvider>,
      );
      await waitFor(() => expect(screen.getByRole("status").textContent).toBe("1,2"));
      if (filter === "search") fireEvent.click(screen.getByText("Search"));
      if (filter === "all items") fireEvent.click(screen.getByText("All items"));
      if (filter === "search") await waitFor(() => expect(mocks.read).toHaveBeenCalled());
      fireEvent.click(screen.getByText("Reorder"));
      await waitFor(() => expect(screen.getByRole("status").textContent).toBe("2,1"));
      expect(screen.getByText("Reorder")).toHaveProperty("disabled", true);
      expect(mocks.save).toHaveBeenCalledOnce();
      client.clear();
    },
  );
});
function createPage({
  itemOrderMode = "release",
  totalItems,
  watchedItems = 0,
  items,
}: {
  itemOrderMode?: WatchlistSummary["itemOrderMode"];
  totalItems?: number;
  watchedItems?: number;
  items: WatchlistItem[];
}): WatchlistDetailPage {
  const nextTotalItems = totalItems ?? items.length;

  return {
    watchlist: {
      id: 1,
      name: "Watchlist",
      description: null,
      itemOrderMode,
      createdAt: "2024-01-01 00:00:00",
      updatedAt: null,
      lastWatchedAt: null,
      lastItemAddedAt: null,
      pausedAt: null,
      stats: {
        totalItems: nextTotalItems,
        watchedItems,
        progress: nextTotalItems ? Math.round((watchedItems / nextTotalItems) * 100) : 0,
        nextUnwatched: null,
        coverImage: null,
        coverMediaType: null,
      },
    },
    items,
  };
}

function createItem({
  id,
  title,
  parentId = null,
  customRank = null,
  isWatched = false,
}: {
  id: number;
  title: string;
  parentId?: string | null;
  customRank?: number | null;
  isWatched?: boolean;
}): WatchlistItem {
  return {
    id,
    watchlistId: 1,
    tmdbId: String(id),
    source: "tmdb",
    mediaType: "movie",
    title,
    parentId,
    parentTitle: null,
    season: null,
    episode: null,
    posterPath: null,
    releaseDate: null,
    voteAverage: null,
    runtime: null,
    customRank,
    isWatched,
    authors: null,
    addedAt: "2024-01-01 00:00:00",
  };
}
