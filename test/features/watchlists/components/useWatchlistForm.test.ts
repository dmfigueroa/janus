// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWatchlistForm } from "@/features/watchlists/components/useWatchlistForm";

const {
  invalidateQueriesMock,
  invalidateMock,
  createWatchlistFnMock,
  updateWatchlistFnMock,
  toasterCreateMock,
  createWatchlistServerFn,
  updateWatchlistServerFn,
} = vi.hoisted(() => ({
  invalidateQueriesMock: vi.fn(),
  invalidateMock: vi.fn(),
  createWatchlistFnMock: vi.fn(),
  updateWatchlistFnMock: vi.fn(),
  toasterCreateMock: vi.fn(),
  createWatchlistServerFn: Symbol("createWatchlist"),
  updateWatchlistServerFn: Symbol("updateWatchlist"),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    invalidate: invalidateMock,
  }),
}));

vi.mock("@/app/Toaster", () => ({ toaster: { create: toasterCreateMock } }));

vi.mock("@/features/watchlists/Cache", () => ({
  invalidateWatchlistQueries: (queryClient: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (queryClient as any).invalidateQueries({ queryKey: ["watchlists"] });
  },
}));

vi.mock("@/features/watchlists/create/Mutation", () => ({
  createWatchlist: createWatchlistServerFn,
}));

vi.mock("@/features/watchlists/update/Mutation", () => ({
  updateWatchlist: updateWatchlistServerFn,
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (serverFn: symbol) => {
    if (serverFn === createWatchlistServerFn) {
      return createWatchlistFnMock;
    }
    if (serverFn === updateWatchlistServerFn) {
      return updateWatchlistFnMock;
    }
    return vi.fn();
  },
}));

describe("useWatchlistForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createWatchlistFnMock.mockResolvedValue({ id: 1, name: "New List" });
    updateWatchlistFnMock.mockResolvedValue({ success: true });
  });

  it("returns initial state in create mode", () => {
    const { result } = renderHook(() => useWatchlistForm({ mode: "create" }));

    expect(result.current.loading).toBe(false);
  });

  it("submits createWatchlist with parsed form data on success", async () => {
    const { result } = renderHook(() => useWatchlistForm({ mode: "create" }));

    act(() => {
      result.current.setValue("name", "New List");
      result.current.setValue("description", "A description");
      result.current.setValue("itemOrderMode", "custom");
    });

    await result.current.onSubmit();

    expect(createWatchlistFnMock).toHaveBeenCalledWith({
      data: { name: "New List", description: "A description", itemOrderMode: "custom" },
    });
    expect(toasterCreateMock).toHaveBeenCalledWith({
      type: "success",
      title: "Watchlist created successfully",
    });
    expect(invalidateMock).toHaveBeenCalled();
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ["watchlists"] });
    expect(result.current.loading).toBe(false);
  });

  it("calls onSuccess after successful submission", async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useWatchlistForm({ mode: "create", onSuccess }));

    act(() => {
      result.current.setValue("name", "New List");
      result.current.setValue("description", "A description");
      result.current.setValue("itemOrderMode", "custom");
    });

    await result.current.onSubmit();

    expect(onSuccess).toHaveBeenCalled();
  });

  it("submits updateWatchlist with parsed form data on success", async () => {
    const watchlist = {
      id: 5,
      name: "Old Name",
      description: null,
      itemOrderMode: "release" as const,
      createdAt: "2024-01-01",
      updatedAt: null,
      lastWatchedAt: null,
      lastItemAddedAt: null,
    };

    const { result } = renderHook(() => useWatchlistForm({ mode: "edit", watchlist }));

    act(() => {
      result.current.setValue("name", "Updated List");
      result.current.setValue("description", "Updated desc");
      result.current.setValue("itemOrderMode", "custom");
    });

    await result.current.onSubmit();

    expect(updateWatchlistFnMock).toHaveBeenCalledWith({
      data: {
        watchlistId: 5,
        name: "Updated List",
        description: "Updated desc",
        itemOrderMode: "custom",
      },
    });
    expect(toasterCreateMock).toHaveBeenCalledWith({
      type: "success",
      title: "Changes saved successfully",
    });
    expect(invalidateMock).toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  it("shows error toast when update returns unsuccessful result", async () => {
    updateWatchlistFnMock.mockResolvedValue({ success: false, message: "Name already exists" });

    const watchlist = {
      id: 5,
      name: "Old Name",
      description: null,
      itemOrderMode: "release" as const,
      createdAt: "2024-01-01",
      updatedAt: null,
      lastWatchedAt: null,
      lastItemAddedAt: null,
    };

    const { result } = renderHook(() => useWatchlistForm({ mode: "edit", watchlist }));

    act(() => {
      result.current.setValue("name", "Updated List");
      result.current.setValue("description", "");
      result.current.setValue("itemOrderMode", "release");
    });

    await result.current.onSubmit();

    expect(toasterCreateMock).toHaveBeenCalledWith({ type: "error", title: "Name already exists" });
    expect(result.current.loading).toBe(false);
  });

  it("shows generic error toast on unexpected exception", async () => {
    createWatchlistFnMock.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useWatchlistForm({ mode: "create" }));

    act(() => {
      result.current.setValue("name", "New List");
      result.current.setValue("description", "");
      result.current.setValue("itemOrderMode", "release");
    });

    await result.current.onSubmit();

    expect(toasterCreateMock).toHaveBeenCalledWith({ type: "error", title: "Network error" });
    expect(result.current.loading).toBe(false);
  });

  it("shows fallback error toast when error is not an Error instance", async () => {
    createWatchlistFnMock.mockRejectedValue("something went wrong");

    const { result } = renderHook(() => useWatchlistForm({ mode: "create" }));

    act(() => {
      result.current.setValue("name", "New List");
      result.current.setValue("description", "");
      result.current.setValue("itemOrderMode", "release");
    });

    await result.current.onSubmit();

    expect(toasterCreateMock).toHaveBeenCalledWith({
      type: "error",
      title: "Failed to save watchlist. Please try again.",
    });
    expect(result.current.loading).toBe(false);
  });
});
