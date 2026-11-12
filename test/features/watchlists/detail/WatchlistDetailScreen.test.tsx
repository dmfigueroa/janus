// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChakraProvider } from "@chakra-ui/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WatchlistItem } from "@/db/Schema";
import type { WatchlistSummary } from "@/features/watchlists/list/Query.server";
import {
  getWatchlistDetailPage,
  watchlistDetailQueryKey,
  type WatchlistDetailPage,
} from "@/features/watchlists/detail/Query";
import { WatchlistDetailScreen } from "@/features/watchlists/detail/WatchlistDetailScreen";
import { janusSystem } from "@/app/Theme";
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  save: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  skip: vi.fn(),
  deleteWatchlist: vi.fn(),
  navigate: vi.fn(),
  routerInvalidate: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@tanstack/react-start", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-start")>()),
  useServerFn: (serverFunction: unknown) => {
    if (serverFunction === getWatchlistDetailPage) return mocks.read;
    if (serverFunction === mocks.pause) return mocks.pause;
    if (serverFunction === mocks.resume) return mocks.resume;
    if (serverFunction === mocks.skip) return mocks.skip;
    if (serverFunction === mocks.deleteWatchlist) return mocks.deleteWatchlist;
    return mocks.save;
  },
}));
vi.mock("@/features/watchlists/detail/Query.server", () => ({ getWatchlistDetail: vi.fn() }));
vi.mock("@/features/watchlists/reorder/Mutation", () => ({ reorderWatchlistItems: vi.fn() }));
vi.mock("@/features/watchlists/lifecycle/WatchlistLifecycleActions", () => ({
  pauseWatchlist: mocks.pause,
  resumeWatchlist: mocks.resume,
  skipWatchlist: mocks.skip,
  deleteWatchlist: mocks.deleteWatchlist,
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useRouter: () => ({ invalidate: mocks.routerInvalidate }),
}));
vi.mock("@/app/Toaster", () => ({ toaster: { create: mocks.toast } }));
vi.mock("@/features/watchlists/components/DeleteWatchlistDialog", () => ({
  DeleteWatchlistDialog: ({ open, handleDelete }: { open: boolean; handleDelete: () => void }) =>
    open ? <button onClick={handleDelete}>Confirm delete</button> : null,
}));
vi.mock("@/features/watchlists/components/WatchlistHeader", () => ({
  WatchlistHeader: ({
    onSearchChange,
    onFilterChange,
    onTogglePause,
    onDelete,
  }: {
    onSearchChange: (value: string) => void;
    onFilterChange: (value: boolean) => void;
    onTogglePause: () => void;
    onDelete: () => void;
  }) => (
    <div>
      <button onClick={() => onSearchChange("match")}>Search</button>
      <button onClick={() => onFilterChange(false)}>All items</button>
      <button onClick={onTogglePause}>Toggle pause</button>
      <button onClick={onDelete}>Open delete</button>
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
beforeEach(() => {
  mocks.pause.mockResolvedValue({ success: true });
  mocks.resume.mockResolvedValue({ success: true });
  mocks.skip.mockResolvedValue({ success: true });
  mocks.deleteWatchlist.mockResolvedValue({ success: true });
  mocks.routerInvalidate.mockResolvedValue(undefined);
  mocks.navigate.mockResolvedValue(undefined);
});
describe("detail lifecycle actions", () => {
  it("pauses from the header and refreshes watchlist and lineup caches", async () => {
    const initialData = createPage({ items: [createItem({ id: 1, title: "First" })] });
    const client = createQueryClient();
    const invalidateQueries = vi.spyOn(client, "invalidateQueries");
    mocks.read.mockResolvedValue(initialData);
    renderScreen(initialData, client);

    await waitFor(() => expect(mocks.read).toHaveBeenCalled());
    fireEvent.click(screen.getByText("Toggle pause"));

    await waitFor(() => expect(mocks.pause).toHaveBeenCalledWith({ data: { watchlistId: 1 } }));
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["watchlists"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["lineups"] });
    expect(mocks.routerInvalidate).toHaveBeenCalled();
    client.clear();
  });

  it("resumes from the header and refreshes watchlist and lineup caches", async () => {
    const initialData = createPage({
      pausedAt: "2024-06-01 00:00:00",
      items: [createItem({ id: 1, title: "First" })],
    });
    const client = createQueryClient();
    const invalidateQueries = vi.spyOn(client, "invalidateQueries");
    mocks.read.mockResolvedValue(initialData);
    renderScreen(initialData, client);

    await waitFor(() => expect(mocks.read).toHaveBeenCalled());
    fireEvent.click(screen.getByText("Toggle pause"));

    await waitFor(() => expect(mocks.resume).toHaveBeenCalledWith({ data: { watchlistId: 1 } }));
    expect(mocks.pause).not.toHaveBeenCalled();
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["watchlists"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["lineups"] });
    expect(mocks.routerInvalidate).toHaveBeenCalled();
    client.clear();
  });

  it("deletes from the detail screen, confirms, and returns home", async () => {
    const initialData = createPage({ items: [createItem({ id: 1, title: "First" })] });
    const client = createQueryClient();
    const invalidateQueries = vi.spyOn(client, "invalidateQueries");
    mocks.read.mockResolvedValue(initialData);
    renderScreen(initialData, client);

    await waitFor(() => expect(mocks.read).toHaveBeenCalled());
    fireEvent.click(screen.getByText("Open delete"));
    fireEvent.click(screen.getByText("Confirm delete"));

    await waitFor(() => expect(mocks.deleteWatchlist).toHaveBeenCalledWith({ data: { id: 1 } }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({ to: "/", replace: true }));
    expect(mocks.toast).toHaveBeenCalledWith({ type: "success", title: "Watchlist deleted" });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["watchlists"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["lineups"] });
    expect(mocks.routerInvalidate).toHaveBeenCalled();
    client.clear();
  });
});
function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
}
function renderScreen(initialData: WatchlistDetailPage, client: QueryClient) {
  render(
    <ChakraProvider value={janusSystem}>
      <QueryClientProvider client={client}>
        <WatchlistDetailScreen initialData={initialData} />
      </QueryClientProvider>
    </ChakraProvider>,
  );
}
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
  pausedAt = null,
  totalItems,
  watchedItems = 0,
  items,
}: {
  itemOrderMode?: WatchlistSummary["itemOrderMode"];
  pausedAt?: string | null;
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
      pausedAt,
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
