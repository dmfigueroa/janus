// @vitest-environment jsdom
import { act, renderHook, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useCardRotation } from "@/features/watchlists/rotation/useCardRotation";
import type { WatchlistSummary } from "@/features/watchlists/list/Query";
const mocks = vi.hoisted(() => ({
  rotate: vi.fn(),
  undo: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/features/watchlists/rotation/CardRotation", () => ({
  rotateWatchlistCard: mocks.rotate,
  undoWatchlistCard: mocks.undo,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (operation: unknown) => operation }));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ invalidate: mocks.refresh }) }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.refresh }),
}));
vi.mock("@/app/Toaster", () => ({ toaster: { create: mocks.toast } }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("shares pending across mounted cards and connects saved refresh failures to Undo", async () => {
  vi.useFakeTimers();
  const watchlist = {
    id: 1,
    name: "Films",
    stats: { nextUnwatched: { id: 2 } },
  } as WatchlistSummary;
  const receipt = {
    watchlistId: 1,
    itemId: 2,
    action: "skip",
    previousPosition: null,
    appliedPosition: "now",
  };
  mocks.rotate.mockResolvedValue({ success: true, receipt });
  mocks.undo.mockResolvedValue({ success: true });
  mocks.refresh.mockRejectedValueOnce(new Error("offline"));
  const first = renderHook(() => useCardRotation(watchlist));
  const second = renderHook(() => useCardRotation(watchlist));
  await act(async () => {
    void first.result.current.perform("skip");
  });
  expect(second.result.current.pending).toBe(true);
  const notice = mocks.toast.mock.calls[0][0];
  expect(notice.title).toContain("Saved, but could not refresh");
  await act(async () => {
    notice.action.onClick();
    await vi.advanceTimersByTimeAsync(600);
  });
  expect(mocks.undo).toHaveBeenCalledWith({ data: receipt });
  expect(second.result.current.pending).toBe(false);
});
