// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@test/utils/Render";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { WatchlistCardMenu } from "@/features/watchlists/components/WatchlistCardMenu";
import type { WatchlistSummary } from "@/features/watchlists/list/Query";

const mocks = vi.hoisted(() => ({ deleteWatchlist: vi.fn(), toast: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (serverFunction: unknown) => serverFunction,
}));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ invalidate: vi.fn() }) }));
vi.mock("@/features/watchlists/delete/Mutation", () => ({
  deleteWatchlist: mocks.deleteWatchlist,
}));
vi.mock("@/features/watchlists/skip/Mutation", () => ({ skipWatchlist: vi.fn() }));
vi.mock("@/features/watchlists/pause/PauseWatchlist", () => ({
  pauseWatchlist: vi.fn(),
  resumeWatchlist: vi.fn(),
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
  fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
  const input = (await screen.findByRole("textbox", {
    name: /watchlist name/i,
  })) as HTMLInputElement;
  const button = screen.getByRole("button", { name: "Delete" }) as HTMLButtonElement;
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
