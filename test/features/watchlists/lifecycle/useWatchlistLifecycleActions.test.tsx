// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useDeleteWatchlist,
  useSkipWatchlist,
  useToggleWatchlistPause,
} from "@/features/watchlists/lifecycle/useWatchlistLifecycleActions";

const mocks = vi.hoisted(() => ({
  pause: vi.fn(),
  resume: vi.fn(),
  skip: vi.fn(),
  delete: vi.fn(),
  routerInvalidate: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/features/watchlists/lifecycle/WatchlistLifecycleActions", () => ({
  pauseWatchlist: mocks.pause,
  resumeWatchlist: mocks.resume,
  skipWatchlist: mocks.skip,
  deleteWatchlist: mocks.delete,
}));
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (serverFunction: unknown) => serverFunction,
}));
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: mocks.routerInvalidate }),
}));
vi.mock("@/app/Toaster", () => ({ toaster: { create: mocks.toast } }));

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return { queryClient, invalidateQueries, Wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pause.mockResolvedValue({ success: true });
  mocks.resume.mockResolvedValue({ success: true });
  mocks.skip.mockResolvedValue({ success: true });
  mocks.delete.mockResolvedValue({ success: true });
  mocks.routerInvalidate.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe("watchlist lifecycle cache synchronization", () => {
  it("pauses a watchlist and refreshes watchlists, lineups, and router data", async () => {
    const { invalidateQueries, Wrapper } = setup();
    const { result } = renderHook(() => useToggleWatchlistPause({ id: 1, pausedAt: null }), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(mocks.pause).toHaveBeenCalledWith({ data: { watchlistId: 1 } });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["watchlists"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["lineups"] });
    expect(mocks.routerInvalidate).toHaveBeenCalledOnce();
  });

  it("resumes a paused watchlist", async () => {
    const { Wrapper } = setup();
    const { result } = renderHook(
      () => useToggleWatchlistPause({ id: 1, pausedAt: "2024-06-01 00:00:00" }),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(mocks.resume).toHaveBeenCalledWith({ data: { watchlistId: 1 } });
    expect(mocks.pause).not.toHaveBeenCalled();
  });

  it("skips a watchlist and refreshes both feature caches", async () => {
    const { invalidateQueries, Wrapper } = setup();
    const { result } = renderHook(() => useSkipWatchlist(1), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(mocks.skip).toHaveBeenCalledWith({ data: { watchlistId: 1 } });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["watchlists"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["lineups"] });
    expect(mocks.routerInvalidate).toHaveBeenCalledOnce();
  });

  it("deletes a watchlist and refreshes both feature caches", async () => {
    const { invalidateQueries, Wrapper } = setup();
    const { result } = renderHook(() => useDeleteWatchlist(1), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(mocks.delete).toHaveBeenCalledWith({ data: { id: 1 } });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["watchlists"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["lineups"] });
    expect(mocks.routerInvalidate).toHaveBeenCalledOnce();
  });

  it("shows an error and still refreshes caches when the action fails", async () => {
    mocks.pause.mockResolvedValue({ success: false, message: "Watchlist not found." });
    const { invalidateQueries, Wrapper } = setup();
    const { result } = renderHook(() => useToggleWatchlistPause({ id: 1, pausedAt: null }), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toThrow("Watchlist not found.");
    });

    expect(mocks.toast).toHaveBeenCalledWith({
      type: "error",
      title: "Failed to change the pause state. Please try again.",
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["watchlists"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["lineups"] });
    expect(mocks.routerInvalidate).toHaveBeenCalledOnce();
  });
});
