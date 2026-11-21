import { flushSync } from "react-dom";
// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWatchlistReorder } from "@/features/watchlists/detail/useWatchlistReorder";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  optimistic: vi.fn(),
  restore: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.save }));
vi.mock("@/features/watchlists/reorder/Mutation", () => ({ reorderWatchlistItems: vi.fn() }));
vi.mock("@/app/Toaster", () => ({ toaster: { create: mocks.toast } }));
vi.mock("@/features/watchlists/detail/WatchlistDetailCache", () => ({
  optimisticallyReorderWatchlistItems: mocks.optimistic,
  restoreWatchlistDetailSnapshot: mocks.restore,
}));
vi.mock("@/features/watchlists/detail/Query", () => ({
  watchlistDetailQueryKey: (filters: object) => ["watchlists", "detail", 1, filters],
}));
function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  const hook = renderHook(
    () =>
      useWatchlistReorder({
        items: [{ id: 1 }, { id: 2 }] as import("@/db/Schema").WatchlistItem[],
        itemOrderMode: "custom",
        canReorder: true,
        watchlistId: 1,
        activeFilters: { watchlistId: 1, itemOrderMode: "custom", unwatchedOnly: false },
      }),
    { wrapper: Wrapper },
  );
  const drop = async () => {
    flushSync(() => hook.result.current.handleDragStart({ active: { id: 1 } } as never));
    return hook.result.current.prepareDrop({ active: { id: 1 }, over: { id: 2 } } as never);
  };
  return { ...hook, client, drop };
}
describe("reorder save lifecycle", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.optimistic.mockResolvedValue([]);
  });
  afterEach(cleanup);
  it("cancels a drag without changing the cache or saving", () => {
    const { result } = setup();
    act(() => result.current.handleDragStart({ active: { id: 1 } } as never));
    expect(result.current.activeItem?.id).toBe(1);
    act(() => result.current.handleDragCancel());
    expect(result.current.activeItem).toBeNull();
    expect(mocks.optimistic).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("ignores a drop onto the same item", async () => {
    const { result } = setup();
    act(() => result.current.handleDragStart({ active: { id: 1 } } as never));
    await act(async () => {
      expect(
        await result.current.prepareDrop({ active: { id: 1 }, over: { id: 1 } } as never),
      ).toBe(true);
      result.current.handleDragEnd();
    });
    expect(mocks.optimistic).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("stays pending until authoritative refresh completes", async () => {
    mocks.save.mockResolvedValue({ success: true });
    const { result, client, drop } = setup();
    let finishRefresh = () => {};
    const refresh = new Promise<void>((resolve) => {
      finishRefresh = resolve;
    });
    const invalidate = vi.spyOn(client, "invalidateQueries").mockReturnValue(refresh);
    await act(async () => {
      await drop();
    });
    await waitFor(() => expect(invalidate).toHaveBeenCalledOnce());
    expect(result.current.isPending).toBe(true);
    expect(mocks.optimistic).toHaveBeenCalledOnce();
    await act(async () => finishRefresh());
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(mocks.restore).not.toHaveBeenCalled();
  });
  it("prepares the drop after the cache update without waiting for the save", async () => {
    let finishOptimistic = (_snapshot: []) => {};
    mocks.optimistic.mockReturnValue(
      new Promise<[]>((resolve) => {
        finishOptimistic = resolve;
      }),
    );
    mocks.save.mockReturnValue(new Promise(() => {}));
    const { result, drop } = setup();
    let prepared: Promise<boolean> | undefined;
    act(() => {
      prepared = drop();
    });
    await waitFor(() => expect(mocks.optimistic).toHaveBeenCalledOnce());
    expect(mocks.save).not.toHaveBeenCalled();
    await act(async () => {
      finishOptimistic([]);
      expect(await prepared).toBe(false);
    });
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    expect(result.current.isPending).toBe(true);
  });

  it("cancels the drop when optimistic preparation fails", async () => {
    mocks.optimistic.mockRejectedValue(new Error("Could not prepare reorder"));
    const { drop } = setup();
    await act(async () => {
      expect(await drop()).toBe(true);
    });
    await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("rolls back a failed save and permits a successful retry", async () => {
    const snapshot: [] = [];
    mocks.optimistic.mockResolvedValue(snapshot);
    mocks.save
      .mockResolvedValueOnce({ success: false, message: "Move rejected" })
      .mockResolvedValueOnce({ success: true });
    const { result, client, drop } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    await act(async () => {
      await drop();
    });
    await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    expect(mocks.restore).toHaveBeenCalledWith({ queryClient: client, snapshot });
    expect(mocks.toast).toHaveBeenCalledWith({ type: "error", title: "Move rejected" });
    await act(async () => {
      await drop();
    });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(mocks.restore).toHaveBeenCalledOnce();
  });
});
