// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWatchlistForm } from "./useWatchlistForm";

const {
  invalidateQueriesMock,
  invalidateMock,
  createWatchlistFnMock,
  updateWatchlistFnMock,
  toastSuccessMock,
  toastErrorMock,
  createWatchlistServerFn,
  updateWatchlistServerFn,
} = vi.hoisted(() => ({
  invalidateQueriesMock: vi.fn(),
  invalidateMock: vi.fn(),
  createWatchlistFnMock: vi.fn(),
  updateWatchlistFnMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
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

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}));

vi.mock("@/features/watchlists/cache", () => ({
  invalidateWatchlistQueries: (queryClient: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (queryClient as any).invalidateQueries({ queryKey: ["watchlists"] });
  },
}));

vi.mock("@/features/watchlists/create/mutation", () => ({
  createWatchlist: createWatchlistServerFn,
}));

vi.mock("@/features/watchlists/update/mutation", () => ({
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

function createMockFormEvent(formValues: Record<string, string>) {
  const form = document.createElement("form");
  for (const [key, value] of Object.entries(formValues)) {
    const input = document.createElement("input");
    input.name = key;
    input.value = value;
    form.appendChild(input);
  }

  return {
    preventDefault: vi.fn(),
    currentTarget: form,
  } as unknown as React.FormEvent<HTMLFormElement>;
}

describe("useWatchlistForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createWatchlistFnMock.mockResolvedValue({ id: 1, name: "New List" });
    updateWatchlistFnMock.mockResolvedValue({ success: true });
  });

  it("returns create labels in create mode", () => {
    const { result } = renderHook(() => useWatchlistForm({ mode: "create" }));

    expect(result.current.title).toBe("Create New List");
    expect(result.current.submitLabel).toBe("Create List");
    expect(result.current.descriptionLabel).toBe(
      "Create a new watchlist to track your movies and shows.",
    );
    expect(result.current.open).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it("returns edit labels in edit mode", () => {
    const watchlist = {
      id: 1,
      name: "My List",
      description: null,
      itemOrderMode: "release" as const,
      createdAt: "2024-01-01",
      updatedAt: null,
      lastWatchedAt: null,
      lastItemAddedAt: null,
    };

    const { result } = renderHook(() => useWatchlistForm({ mode: "edit", watchlist }));

    expect(result.current.title).toBe("Edit List");
    expect(result.current.submitLabel).toBe("Save Changes");
    expect(result.current.descriptionLabel).toBe("Update your watchlist details.");
  });

  it("submits createWatchlist with parsed form data on success", async () => {
    const { result } = renderHook(() => useWatchlistForm({ mode: "create" }));

    const event = createMockFormEvent({
      name: "New List",
      description: "A description",
      itemOrderMode: "custom",
    });

    await result.current.onSubmit(event);

    expect(createWatchlistFnMock).toHaveBeenCalledWith({
      data: { name: "New List", description: "A description", itemOrderMode: "custom" },
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Watchlist created successfully");
    expect(invalidateMock).toHaveBeenCalled();
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ["watchlists"] });
    expect(result.current.open).toBe(false);
    expect(result.current.loading).toBe(false);
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

    const event = createMockFormEvent({
      name: "Updated List",
      description: "Updated desc",
      itemOrderMode: "custom",
    });

    await result.current.onSubmit(event);

    expect(updateWatchlistFnMock).toHaveBeenCalledWith({
      data: {
        watchlistId: 5,
        name: "Updated List",
        description: "Updated desc",
        itemOrderMode: "custom",
      },
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Changes saved successfully");
    expect(invalidateMock).toHaveBeenCalled();
    expect(result.current.open).toBe(false);
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

    const event = createMockFormEvent({
      name: "Updated List",
      description: "",
      itemOrderMode: "release",
    });

    await result.current.onSubmit(event);

    expect(toastErrorMock).toHaveBeenCalledWith("Name already exists");
    expect(result.current.loading).toBe(false);
    expect(result.current.open).toBe(false);
  });

  it("shows generic error toast on unexpected exception", async () => {
    createWatchlistFnMock.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useWatchlistForm({ mode: "create" }));

    const event = createMockFormEvent({
      name: "New List",
      description: "",
      itemOrderMode: "release",
    });

    await result.current.onSubmit(event);

    expect(toastErrorMock).toHaveBeenCalledWith("Network error");
    expect(result.current.loading).toBe(false);
    expect(result.current.open).toBe(false);
  });

  it("shows fallback error toast when error is not an Error instance", async () => {
    createWatchlistFnMock.mockRejectedValue("something went wrong");

    const { result } = renderHook(() => useWatchlistForm({ mode: "create" }));

    const event = createMockFormEvent({
      name: "New List",
      description: "",
      itemOrderMode: "release",
    });

    await result.current.onSubmit(event);

    expect(toastErrorMock).toHaveBeenCalledWith("Failed to save watchlist. Please try again.");
    expect(result.current.loading).toBe(false);
  });
});
