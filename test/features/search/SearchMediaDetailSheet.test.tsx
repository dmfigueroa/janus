// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "../../utils/Render";
import { SearchMediaDetailSheet } from "@/features/search/SearchMediaDetailSheet";

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

vi.mock("@/features/search/SearchWatchlistSelector", () => ({
  SearchWatchlistSelector: ({
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

vi.mock("@/features/watchlists/add/Mutation", () => ({
  addToWatchlist: addToWatchlistServerFn,
}));

vi.mock("@/features/watchlists/list/Query", () => ({
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

vi.mock("@/app/Toaster", () => ({ toaster: { create: vi.fn() } }));

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
    cleanup();
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
    expect(screen.getByText("Selected: 2")).not.toBeNull();

    const endRadio = screen.getByRole("radio", { name: "End" });
    endRadio.click();
    await waitFor(() => expect(endRadio).toHaveProperty("checked", true));
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
