// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchMediaDetailSheet } from "./SearchMediaDetailSheet";

const {
  addToWatchlistFnMock,
  getWatchlistListFnMock,
  addToWatchlistServerFn,
  getWatchlistListServerFn,
} = vi.hoisted(() => ({
  addToWatchlistFnMock: vi.fn(),
  getWatchlistListFnMock: vi.fn(),
  addToWatchlistServerFn: Symbol("addToWatchlist"),
  getWatchlistListServerFn: Symbol("getWatchlistList"),
}));

vi.mock("dompurify", () => ({
  default: {
    sanitize: (value: string) => value,
  },
}));

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
  SheetDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/watchlist/WatchlistSelector", () => ({
  WatchlistSelector: ({
    onSelect,
    selectedWatchlistId,
    watchlists,
  }: {
    onSelect: (id: string) => void;
    selectedWatchlistId: string;
    watchlists?: Array<{ id: number; name: string }>;
  }) => (
    <div aria-label="Watchlist">
      <div>Selected: {selectedWatchlistId || "none"}</div>
      <button type="button" onClick={() => onSelect("")}>
        Clear selection
      </button>
      {watchlists?.map((watchlist) => (
        <button key={watchlist.id} type="button" onClick={() => onSelect(watchlist.id.toString())}>
          {watchlist.name}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("@/features/watchlists/add/mutation", () => ({
  addToWatchlist: addToWatchlistServerFn,
}));

vi.mock("@/features/watchlists/list/query", () => ({
  getWatchlistList: getWatchlistListServerFn,
  watchlistListQueryKey: () => ["watchlists", "list", { orderBy: "lastAdded" }],
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: [
      {
        id: 1,
        name: "Release Queue",
        itemOrderMode: "release",
      },
      {
        id: 2,
        name: "Custom Queue",
        itemOrderMode: "custom",
      },
    ],
  }),
  useMutation: ({
    mutationFn,
    onError,
    onSuccess,
  }: {
    mutationFn: () => Promise<unknown>;
    onError?: (error: unknown) => void;
    onSuccess?: (data: unknown) => void;
  }) => ({
    isPending: false,
    mutate: async () => {
      try {
        const result = await mutationFn();
        onSuccess?.(result);
      } catch (error) {
        onError?.(error);
      }
    },
  }),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (serverFn: symbol) => {
    if (serverFn === getWatchlistListServerFn) {
      return getWatchlistListFnMock;
    }

    if (serverFn === addToWatchlistServerFn) {
      return addToWatchlistFnMock;
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

describe("SearchMediaDetailSheet custom-order insertion choices", () => {
  beforeEach(() => {
    addToWatchlistFnMock.mockReset();
    getWatchlistListFnMock.mockReset();

    addToWatchlistFnMock.mockResolvedValue({
      success: true,
      message: "Added to watchlist",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows insertion choices only for custom-ordered watchlists and passes the selected choice", async () => {
    render(
      <SearchMediaDetailSheet
        media={{
          id: "movie-1",
          mediaType: "movie",
          source: "custom",
          title: "Movie One",
          poster: null,
          backdrop: null,
          overview: "Overview",
          rating: 7.2,
          year: "2025",
        }}
        isOpen
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByText("Insert in custom order")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Release Queue" }));

    expect(screen.queryByText("Insert in custom order")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Custom Queue" }));

    expect(await screen.findByText("Insert in custom order")).not.toBeNull();

    fireEvent.click(screen.getByLabelText("End"));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(addToWatchlistFnMock).toHaveBeenCalledWith({
        data: {
          watchlistId: 2,
          insertionPosition: "end",
          media: expect.objectContaining({
            id: "movie-1",
          }),
        },
      });
    });
  });
});
