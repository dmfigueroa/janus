// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReorderWatchlistItemsMutation } from "@/features/watchlists/detail/useReorderWatchlistItemsMutation";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  optimistic: vi.fn(),
  restore: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.save }));
vi.mock("@/features/watchlists/reorder/Mutation", () => ({ reorderWatchlistItems: vi.fn() }));
vi.mock("@/app/Toaster", () => ({ toaster: { create: mocks.toast } }));
vi.mock("@/features/watchlists/detail/Cache", () => ({
  optimisticallyReorderWatchlistItems: mocks.optimistic,
  restoreWatchlistDetailSnapshot: mocks.restore,
}));
vi.mock("@/features/watchlists/detail/Query", () => ({
  watchlistDetailQueryKey: (filters: object) => ["watchlists", "detail", 1, filters],
}));
const intent = { movedItemId: 1, referenceItemId: 2, position: "after" as const };
function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  const hook = renderHook(
    () =>
      useReorderWatchlistItemsMutation({
        watchlistId: 1,
        activeFilters: { watchlistId: 1, itemOrderMode: "custom", unwatchedOnly: false },
      }),
    { wrapper: Wrapper },
  );
  return { ...hook, client };
}
describe("reorder save lifecycle", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.optimistic.mockResolvedValue([]);
  });
  afterEach(cleanup);
  it("stays pending until authoritative refresh completes", async () => {
    mocks.save.mockResolvedValue({ success: true });
    const { result, client } = setup();
    let finishRefresh = () => {};
    const refresh = new Promise<void>((resolve) => {
      finishRefresh = resolve;
    });
    const invalidate = vi.spyOn(client, "invalidateQueries").mockReturnValue(refresh);
    act(() => result.current.mutate(intent));
    await waitFor(() => expect(invalidate).toHaveBeenCalledOnce());
    expect(result.current.isPending).toBe(true);
    expect(mocks.optimistic).toHaveBeenCalledOnce();
    await act(async () => finishRefresh());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.restore).not.toHaveBeenCalled();
  });
  it("rolls back a failed save and permits a successful retry", async () => {
    const snapshot: [] = [];
    mocks.optimistic.mockResolvedValue(snapshot);
    mocks.save
      .mockResolvedValueOnce({ success: false, message: "Move rejected" })
      .mockResolvedValueOnce({ success: true });
    const { result, client } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    act(() => result.current.mutate(intent));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mocks.restore).toHaveBeenCalledWith({ queryClient: client, snapshot });
    expect(mocks.toast).toHaveBeenCalledWith({ type: "error", title: "Move rejected" });
    act(() => result.current.mutate(intent));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(mocks.restore).toHaveBeenCalledOnce();
  });
});
