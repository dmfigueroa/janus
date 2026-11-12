// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@test/utils/Render";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { WatchlistCardMenu } from "@/features/watchlists/components/WatchlistCardMenu";
import type { WatchlistSummary } from "@/features/watchlists/list/Query";

const mocks = vi.hoisted(() => ({
  deleteWatchlist: vi.fn(),
  skipWatchlist: vi.fn(),
  pauseWatchlist: vi.fn(),
  resumeWatchlist: vi.fn(),
  routerInvalidate: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (serverFunction: unknown) => serverFunction,
}));
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: mocks.routerInvalidate }),
}));
vi.mock("@/features/watchlists/lifecycle/WatchlistLifecycleActions", () => ({
  deleteWatchlist: mocks.deleteWatchlist,
  skipWatchlist: mocks.skipWatchlist,
  pauseWatchlist: mocks.pauseWatchlist,
  resumeWatchlist: mocks.resumeWatchlist,
}));
vi.mock("@/app/Toaster", () => ({ toaster: { create: mocks.toast } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("requires the typed name from the card and preserves it after a failed deletion", async () => {
  mocks.deleteWatchlist.mockResolvedValue({ success: false, message: "failed" });
  const watchlist = {
    id: 1,
    name: "Movie Night",
    pausedAt: null,
    stats: { nextUnwatched: null },
  } as WatchlistSummary;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <WatchlistCardMenu watchlist={watchlist} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Watchlist actions for Movie Night" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Delete watchlist" }));
  const input = (await screen.findByRole("textbox", {
    name: /watchlist name/i,
  })) as HTMLInputElement;
  const button = screen.getByRole("button", { name: "Delete watchlist" }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  fireEvent.change(input, { target: { value: "Movie Night" } });
  fireEvent.click(button);
  await waitFor(() =>
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ type: "error" })),
  );
  expect(input.value).toBe("Movie Night");
  expect(button.disabled).toBe(false);
  expect(screen.getByRole("alertdialog")).toBeTruthy();
});

it("deletes a watchlist from the card and refreshes watchlist and lineup caches", async () => {
  mocks.deleteWatchlist.mockResolvedValue({ success: true });
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
  const watchlist = {
    id: 1,
    name: "Movie Night",
    pausedAt: null,
    stats: { nextUnwatched: null },
  } as WatchlistSummary;
  render(
    <QueryClientProvider client={queryClient}>
      <WatchlistCardMenu watchlist={watchlist} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Watchlist actions for Movie Night" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Delete watchlist" }));
  fireEvent.change(await screen.findByRole("textbox", { name: /watchlist name/i }), {
    target: { value: "Movie Night" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Delete watchlist" }));

  await waitFor(() => expect(mocks.deleteWatchlist).toHaveBeenCalledWith({ data: { id: 1 } }));
  await waitFor(() => expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["watchlists"] }));
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["lineups"] });
  expect(mocks.routerInvalidate).toHaveBeenCalled();
  expect(mocks.toast).toHaveBeenCalledWith({ type: "success", title: "Watchlist deleted" });
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
});
