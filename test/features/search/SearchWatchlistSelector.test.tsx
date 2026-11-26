// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "../../utils/Render";
import { SearchWatchlistSelector } from "@/features/search/SearchWatchlistSelector";

const { createWatchlistFnMock, createWatchlistServerFn, toasterCreateMock } = vi.hoisted(() => ({
  createWatchlistFnMock: vi.fn(),
  createWatchlistServerFn: Symbol("createWatchlist"),
  toasterCreateMock: vi.fn(),
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
  useMutation: ({
    mutationFn,
    onSuccess,
    onError,
  }: {
    mutationFn: (name: string) => Promise<unknown>;
    onSuccess?: (data: unknown) => Promise<void> | void;
    onError?: (error: unknown) => void;
  }) => ({
    isPending: false,
    mutate: (name: string) => {
      void Promise.resolve()
        .then(() => mutationFn(name))
        .then((result) => onSuccess?.(result))
        .catch((error) => onError?.(error));
    },
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: vi.fn() }),
}));

vi.mock("@/app/Toaster", () => ({ toaster: { create: toasterCreateMock } }));

const watchlists = [
  { id: 1, name: "Release Queue" },
  { id: 2, name: "Custom Queue" },
] as never[];

describe("SearchWatchlistSelector", () => {
  beforeEach(() => {
    createWatchlistFnMock.mockReset();
    toasterCreateMock.mockReset();
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

  it("opens the watchlist options when the input receives focus", async () => {
    render(
      <SearchWatchlistSelector watchlists={watchlists} selectedWatchlistId="" onSelect={vi.fn()} />,
    );

    fireEvent.focus(screen.getByRole("combobox"));

    expect(await screen.findByRole("option", { name: "Custom Queue" })).not.toBeNull();
  });

  it("filters existing watchlists by name when the input receives a value", async () => {
    render(
      <SearchWatchlistSelector watchlists={watchlists} selectedWatchlistId="" onSelect={vi.fn()} />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "release" } });

    expect(await screen.findByRole("option", { name: "Release Queue" })).not.toBeNull();
    expect(screen.queryByRole("option", { name: "Custom Queue" })).toBeNull();
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
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "New Queue" } });
    fireEvent.click(await screen.findByRole("option", { name: 'Create "New Queue"' }));

    await waitFor(() => {
      expect(createWatchlistFnMock).toHaveBeenCalledWith({ data: { name: "New Queue" } });
      expect(onSelect).toHaveBeenCalledWith("3");
    });
  });

  it("shows an error toast when creating a watchlist fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const onSelect = vi.fn();
    createWatchlistFnMock.mockRejectedValue(new Error("boom"));
    render(
      <SearchWatchlistSelector
        watchlists={watchlists}
        selectedWatchlistId=""
        onSelect={onSelect}
      />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Broken Queue" } });
    fireEvent.click(await screen.findByRole("option", { name: 'Create "Broken Queue"' }));

    await waitFor(() => {
      expect(toasterCreateMock).toHaveBeenCalledWith({
        type: "error",
        title: "Failed to create watchlist",
      });
    });
    expect(onSelect).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });
});
