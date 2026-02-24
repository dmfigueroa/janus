// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, WatchlistDetail } from "./$watchlistId";
import { getWatchlistById } from "@/server/watchlists";

vi.mock("@/server/watchlists", () => ({
  getWatchlistById: vi.fn(),
}));

const mockedGetWatchlistById = vi.mocked(getWatchlistById);

const baseData = {
  watchlist: {
    id: 1,
    name: "Test List",
    description: null,
    createdAt: "2024-01-01",
    updatedAt: null,
    lastWatchedAt: null,
    lastItemAddedAt: null,
    stats: {
      totalItems: 0,
      watchedItems: 0,
      progress: 0,
      nextUnwatched: null,
      coverImage: null,
      coverMediaType: null,
    },
  },
  items: [],
  nextCursor: undefined,
};

describe("watchlist search UI", () => {
  let loaderSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockedGetWatchlistById.mockResolvedValue(baseData);
    loaderSpy = vi.spyOn(Route, "useLoaderData").mockReturnValue(baseData);
  });

  afterEach(() => {
    loaderSpy.mockRestore();
    vi.clearAllMocks();
  });

  it("passes search query to the backend after debounce", async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <WatchlistDetail />
      </QueryClientProvider>,
    );

    await user.type(screen.getByPlaceholderText("Search titles..."), "saga");
    await vi.advanceTimersByTimeAsync(350);

    await waitFor(() => {
      expect(mockedGetWatchlistById).toHaveBeenLastCalledWith({
        data: {
          id: 1,
          page: 1,
          limit: 50,
          query: "saga",
          isWatched: false,
        },
      });
    });

    vi.useRealTimers();
  });
});
