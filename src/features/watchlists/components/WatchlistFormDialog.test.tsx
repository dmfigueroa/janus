// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WatchlistFormDialog } from "./WatchlistFormDialog";
import type { Watchlist } from "@/db/schema";

const {
  invalidateMock,
  createWatchlistFnMock,
  updateWatchlistFnMock,
  createWatchlistServerFn,
  updateWatchlistServerFn,
} = vi.hoisted(() => ({
  invalidateMock: vi.fn(),
  createWatchlistFnMock: vi.fn(),
  updateWatchlistFnMock: vi.fn(),
  createWatchlistServerFn: Symbol("createWatchlist"),
  updateWatchlistServerFn: Symbol("updateWatchlist"),
}));

vi.mock("@/features/watchlists/create/mutation", () => ({
  createWatchlist: createWatchlistServerFn,
}));

vi.mock("@/features/watchlists/update/mutation", () => ({
  updateWatchlist: updateWatchlistServerFn,
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    invalidate: invalidateMock,
  }),
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

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) => (
    <div data-testid="dialog" data-open={open}>
      {children}
    </div>
  ),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function watchlistFixture(overrides?: Partial<Watchlist>): Watchlist {
  return {
    id: overrides?.id ?? 1,
    name: overrides?.name ?? "My List",
    description: overrides?.description ?? null,
    itemOrderMode: overrides?.itemOrderMode ?? "release",
    createdAt: overrides?.createdAt ?? "2024-01-01 00:00:00",
    updatedAt: overrides?.updatedAt ?? null,
    lastWatchedAt: overrides?.lastWatchedAt ?? null,
    lastItemAddedAt: overrides?.lastItemAddedAt ?? null,
  };
}

describe("WatchlistFormDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createWatchlistFnMock.mockResolvedValue({ id: 99, name: "New List" });
    updateWatchlistFnMock.mockResolvedValue({ success: true });

    globalThis.ResizeObserver = vi.fn(() => ({
      observe: vi.fn(),
      disconnect: vi.fn(),
      unobserve: vi.fn(),
    })) as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    cleanup();
  });

  describe("create mode", () => {
    it("renders with create title and empty form fields", () => {
      render(<WatchlistFormDialog mode="create" trigger={<button>Open</button>} />);
      fireEvent.click(screen.getByRole("button", { name: "Open" }));

      expect(screen.getByRole("heading", { name: "Create New List" })).not.toBeNull();
      expect(screen.getByRole("button", { name: "Create List" })).not.toBeNull();
      expect(screen.getByLabelText("Name")).toHaveProperty("value", "");
      expect(screen.getByLabelText("Description")).toHaveProperty("value", "");
      expect(screen.getByLabelText("Release order").getAttribute("data-state")).toBe("checked");
      expect(screen.getByLabelText("Custom order").getAttribute("data-state")).toBe("unchecked");
    });

    it("submits createWatchlist with form values and shows success", async () => {
      render(<WatchlistFormDialog mode="create" trigger={<button>Open</button>} />);
      fireEvent.click(screen.getByRole("button", { name: "Open" }));

      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New List" } });
      fireEvent.change(screen.getByLabelText("Description"), {
        target: { value: "A description" },
      });
      fireEvent.click(screen.getByLabelText("Custom order"));
      fireEvent.click(screen.getByRole("button", { name: "Create List" }));

      await waitFor(() => {
        expect(createWatchlistFnMock).toHaveBeenCalledWith({
          data: { name: "New List", description: "A description", itemOrderMode: "custom" },
        });
      });

      await waitFor(() => {
        expect(invalidateMock).toHaveBeenCalled();
      });
    });
  });

  describe("edit mode", () => {
    it("renders with edit title and pre-filled form fields", () => {
      render(
        <WatchlistFormDialog
          mode="edit"
          watchlist={watchlistFixture({
            name: "Existing List",
            description: "Existing desc",
            itemOrderMode: "custom",
          })}
          trigger={<button>Open</button>}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Open" }));

      expect(screen.getByRole("heading", { name: "Edit List" })).not.toBeNull();
      expect(screen.getByRole("button", { name: "Save Changes" })).not.toBeNull();
      expect(screen.getByLabelText("Name")).toHaveProperty("value", "Existing List");
      expect(screen.getByLabelText("Description")).toHaveProperty("value", "Existing desc");
      expect(screen.getByLabelText("Release order").getAttribute("data-state")).toBe("unchecked");
      expect(screen.getByLabelText("Custom order").getAttribute("data-state")).toBe("checked");
    });

    it("submits updateWatchlist with form values and shows success", async () => {
      render(
        <WatchlistFormDialog
          mode="edit"
          watchlist={watchlistFixture({
            id: 5,
            name: "Existing List",
            description: "Existing desc",
            itemOrderMode: "custom",
          })}
          trigger={<button>Open</button>}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Open" }));

      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Updated List" } });
      fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Updated desc" } });
      fireEvent.click(screen.getByLabelText("Release order"));
      fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

      await waitFor(() => {
        expect(updateWatchlistFnMock).toHaveBeenCalledWith({
          data: {
            watchlistId: 5,
            name: "Updated List",
            description: "Updated desc",
            itemOrderMode: "release",
          },
        });
      });

      await waitFor(() => {
        expect(invalidateMock).toHaveBeenCalled();
      });
    });

    it("clears description when empty string is submitted", async () => {
      render(
        <WatchlistFormDialog
          mode="edit"
          watchlist={watchlistFixture({
            id: 6,
            name: "List",
            description: "Will clear",
            itemOrderMode: "release",
          })}
          trigger={<button>Open</button>}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Open" }));

      fireEvent.change(screen.getByLabelText("Description"), { target: { value: "" } });
      fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

      await waitFor(() => {
        expect(updateWatchlistFnMock).toHaveBeenCalledWith({
          data: {
            watchlistId: 6,
            name: "List",
            description: "",
            itemOrderMode: "release",
          },
        });
      });
    });
  });
});
