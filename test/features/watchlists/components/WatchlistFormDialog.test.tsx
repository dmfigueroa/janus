// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React, { createContext, useContext } from "react";
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

const RadioContext = createContext<{ defaultValue?: string; name?: string }>({});
const DialogContext = createContext<{ onOpenChange: (open: boolean) => void }>({
  onOpenChange: () => undefined,
});

vi.mock("@chakra-ui/react", () => ({
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Button: ({
    children,
    colorPalette: _colorPalette,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { colorPalette?: string }) => (
    <button {...props}>{children}</button>
  ),
  Dialog: {
    Root: ({
      children,
      open,
      onOpenChange,
    }: {
      children: React.ReactNode;
      open?: boolean;
      onOpenChange: (details: { open: boolean }) => void;
    }) => (
      <DialogContext.Provider
        value={{ onOpenChange: (nextOpen) => onOpenChange({ open: nextOpen }) }}
      >
        <div data-testid="chakra-dialog" data-open={open}>
          {children}
        </div>
      </DialogContext.Provider>
    ),
    Trigger: ({ children }: { children: React.ReactElement }) => {
      const context = useContext(DialogContext);
      return React.cloneElement(children as React.ReactElement<{ onClick?: () => void }>, {
        onClick: () => context.onOpenChange(true),
      });
    },
    Backdrop: () => null,
    Positioner: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Content: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Header: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Title: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
    Description: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
    Body: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Footer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    CloseTrigger: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => {
      const context = useContext(DialogContext);
      return <button {...props} onClick={() => context.onOpenChange(false)} />;
    },
  },
  Field: {
    Root: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Label: ({ children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
      <label {...props}>{children}</label>
    ),
  },
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
  RadioGroup: {
    Root: ({
      children,
      defaultValue,
      name,
    }: {
      children: React.ReactNode;
      defaultValue?: string;
      name?: string;
    }) => (
      <RadioContext.Provider value={{ defaultValue, name }}>
        <div>{children}</div>
      </RadioContext.Provider>
    ),
    Item: ({ children, value }: { children: React.ReactNode; value: string }) => {
      const context = useContext(RadioContext);
      return (
        <label data-state={context.defaultValue === value ? "checked" : "unchecked"}>
          {React.Children.map(children, (child) =>
            React.isValidElement(child)
              ? React.cloneElement(child as React.ReactElement<Record<string, unknown>>, {
                  name: context.name,
                  value,
                  defaultChecked: context.defaultValue === value,
                })
              : child,
          )}
        </label>
      );
    },
    ItemHiddenInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
      <input type="radio" {...props} />
    ),
    ItemControl: () => null,
    ItemText: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
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
    it("renders through the Chakra dialog seam", () => {
      render(<WatchlistFormDialog mode="create" trigger={<button>Open</button>} />);

      expect(screen.getByTestId("chakra-dialog")).not.toBeNull();
    });

    it("discards unsaved changes when closed and reopened", () => {
      render(<WatchlistFormDialog mode="create" trigger={<button>Open</button>} />);

      fireEvent.click(screen.getByRole("button", { name: "Open" }));
      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Unsaved List" } });
      fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
      fireEvent.click(screen.getByRole("button", { name: "Open" }));

      expect(screen.getByLabelText("Name")).toHaveProperty("value", "");
    });

    it("renders with create title and empty form fields", () => {
      render(<WatchlistFormDialog mode="create" trigger={<button>Open</button>} />);
      fireEvent.click(screen.getByRole("button", { name: "Open" }));

      expect(screen.getByRole("heading", { name: "Create New List" })).not.toBeNull();
      expect(screen.getByRole("button", { name: "Create List" })).not.toBeNull();
      expect(screen.getByLabelText("Name")).toHaveProperty("value", "");
      expect(screen.getByLabelText("Description")).toHaveProperty("value", "");
      expect(screen.getByLabelText("Release order")).toHaveProperty("checked", true);
      expect(screen.getByLabelText("Custom order")).toHaveProperty("checked", false);
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
