// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@test/utils/Render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WatchlistFormDialog } from "@/features/watchlists/components/WatchlistFormDialog";
import type { Watchlist } from "@/db/Schema";

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

vi.mock("@/features/watchlists/create/Mutation", () => ({
  createWatchlist: createWatchlistServerFn,
}));

vi.mock("@/features/watchlists/update/Mutation", () => ({
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

async function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Open" }));
  await waitFor(() => expect(screen.getByRole("dialog")).not.toBeNull());
}

async function closeDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

describe("WatchlistFormDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createWatchlistFnMock.mockResolvedValue({ id: 99, name: "New List" });
    updateWatchlistFnMock.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    cleanup();
  });

  describe("create mode", () => {
    it("opens the dialog from its trigger", async () => {
      render(<WatchlistFormDialog mode="create" trigger={<button>Open</button>} />);

      await openDialog();
    });

    it("discards unsaved changes when closed and reopened", async () => {
      render(<WatchlistFormDialog mode="create" trigger={<button>Open</button>} />);

      await openDialog();
      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Unsaved List" } });
      await closeDialog();
      await openDialog();

      expect(screen.getByLabelText("Name")).toHaveProperty("value", "");
    });

    it("renders with create title and empty form fields", async () => {
      render(<WatchlistFormDialog mode="create" trigger={<button>Open</button>} />);
      await openDialog();

      expect(screen.getByRole("heading", { name: "Create New List" })).not.toBeNull();
      expect(screen.getByRole("button", { name: "Create List" })).not.toBeNull();
      expect(screen.getByLabelText("Name")).toHaveProperty("value", "");
      expect(screen.getByLabelText("Description")).toHaveProperty("value", "");
      expect(screen.getByLabelText("Release order")).toHaveProperty("checked", true);
      expect(screen.getByLabelText("Custom order")).toHaveProperty("checked", false);
    });

    it("submits createWatchlist with form values and shows success", async () => {
      render(<WatchlistFormDialog mode="create" trigger={<button>Open</button>} />);
      await openDialog();

      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New List" } });
      fireEvent.change(screen.getByLabelText("Description"), {
        target: { value: "A description" },
      });
      const customOrderRadio = screen.getByRole("radio", { name: "Custom order" });
      customOrderRadio.click();
      await waitFor(() => expect(customOrderRadio).toHaveProperty("checked", true));
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
    it("renders with edit title and pre-filled form fields", async () => {
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
      await openDialog();

      expect(screen.getByRole("heading", { name: "Edit List" })).not.toBeNull();
      expect(screen.getByRole("button", { name: "Save Changes" })).not.toBeNull();
      expect(screen.getByLabelText("Name")).toHaveProperty("value", "Existing List");
      expect(screen.getByLabelText("Description")).toHaveProperty("value", "Existing desc");
      expect(screen.getByLabelText("Release order")).toHaveProperty("checked", false);
      expect(screen.getByLabelText("Custom order")).toHaveProperty("checked", true);
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
      await openDialog();

      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Updated List" } });
      fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Updated desc" } });
      const releaseOrderRadio = screen.getByRole("radio", { name: "Release order" });
      releaseOrderRadio.click();
      await waitFor(() => expect(releaseOrderRadio).toHaveProperty("checked", true));
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
      await openDialog();

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
