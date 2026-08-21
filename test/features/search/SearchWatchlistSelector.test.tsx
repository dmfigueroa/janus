// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "../../utils/Render";
import { SearchWatchlistSelector } from "@/features/search/SearchWatchlistSelector";

const { createWatchlistFnMock, createWatchlistServerFn } = vi.hoisted(() => ({
  createWatchlistFnMock: vi.fn(),
  createWatchlistServerFn: Symbol("createWatchlist"),
}));

vi.mock("@/features/watchlists/create/Mutation", () => ({
  createWatchlist: createWatchlistServerFn,
}));

vi.mock("@/features/watchlists/list/Query", () => ({
  watchlistListQueryKey: () => ["watchlists", "list", { orderBy: "lastAdded" }],
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (serverFn: symbol) => {
    if (serverFn === createWatchlistServerFn) return createWatchlistFnMock;
    return vi.fn();
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: vi.fn() }),
}));

vi.mock("@/app/Toaster", () => ({ toaster: { create: vi.fn() } }));

const watchlists = [
  { id: 1, name: "Release Queue" },
  { id: 2, name: "Custom Queue" },
] as never[];

describe("SearchWatchlistSelector", () => {
  beforeEach(() => {
    createWatchlistFnMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("selects an existing watchlist through the combobox", async () => {
    const onSelect = vi.fn();
    render(
      <SearchWatchlistSelector
        watchlists={watchlists}
        selectedWatchlistId=""
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open watchlist list" }));
    fireEvent.click(await screen.findByRole("option", { name: "Custom Queue" }));

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith("2"));
  });

  it("creates a watchlist from the search value", async () => {
    const onSelect = vi.fn();
    createWatchlistFnMock.mockResolvedValue({ id: 3, name: "New Queue" });
    render(
      <SearchWatchlistSelector
        watchlists={watchlists}
        selectedWatchlistId=""
        onSelect={onSelect}
      />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.click(screen.getByRole("button", { name: "Open watchlist list" }));
    fireEvent.change(input, { target: { value: "New Queue" } });
    fireEvent.click(await screen.findByRole("option", { name: 'Create "New Queue"' }));

    await waitFor(() => {
      expect(createWatchlistFnMock).toHaveBeenCalledWith({ data: { name: "New Queue" } });
      expect(onSelect).toHaveBeenCalledWith("3");
    });
  });
});
