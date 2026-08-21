// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MergeWatchlistDialog } from "@/components/MergeWatchlistDialog";
import type { EnrichedWatchlist } from "@/features/watchlists/components/WatchlistCard";

const { invalidateMock, mergeWatchlistsFnMock, mergeWatchlistsServerFn } = vi.hoisted(() => ({
  invalidateMock: vi.fn(),
  mergeWatchlistsFnMock: vi.fn(),
  mergeWatchlistsServerFn: Symbol("mergeWatchlists"),
}));

vi.mock("@/features/watchlists/merge/Mutation", () => ({
  mergeWatchlists: mergeWatchlistsServerFn,
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    invalidate: invalidateMock,
  }),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (serverFn: symbol) => {
    if (serverFn === mergeWatchlistsServerFn) {
      return mergeWatchlistsFnMock;
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

vi.mock("@/components/ui/Dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

function watchlist(
  overrides: Partial<EnrichedWatchlist> & Pick<EnrichedWatchlist, "id" | "name">,
): EnrichedWatchlist {
  return {
    id: overrides.id,
    name: overrides.name,
    description: overrides.description ?? null,
    itemOrderMode: overrides.itemOrderMode ?? "release",
    createdAt: overrides.createdAt ?? "2024-01-01 00:00:00",
    updatedAt: overrides.updatedAt ?? null,
    lastWatchedAt: overrides.lastWatchedAt ?? null,
    lastItemAddedAt: overrides.lastItemAddedAt ?? null,
    stats: overrides.stats ?? {
      totalItems: 0,
      watchedItems: 0,
      progress: 0,
      nextUnwatched: null,
      coverImage: null,
      coverMediaType: null,
    },
  };
}

describe("MergeWatchlistDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mergeWatchlistsFnMock.mockResolvedValue({
      success: true,
      targetId: 99,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows an explicit merge order and submits the reordered source sequence", async () => {
    render(
      <MergeWatchlistDialog
        open
        onOpenChange={vi.fn()}
        selectedWatchlistIds={[2, 1, 3]}
        allWatchlists={[
          watchlist({ id: 1, name: "Alpha" }),
          watchlist({ id: 2, name: "Beta", itemOrderMode: "custom" }),
          watchlist({ id: 3, name: "Gamma" }),
        ]}
      />,
    );

    expect(screen.getAllByTestId(/merge-order-item-/).map((item) => item.textContent)).toEqual([
      expect.stringContaining("Beta"),
      expect.stringContaining("Alpha"),
      expect.stringContaining("Gamma"),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Move Beta down" }));

    expect(screen.getAllByTestId(/merge-order-item-/).map((item) => item.textContent)).toEqual([
      expect.stringContaining("Alpha"),
      expect.stringContaining("Beta"),
      expect.stringContaining("Gamma"),
    ]);

    fireEvent.change(screen.getByPlaceholderText("New Watchlist Name"), {
      target: { value: "Merged Queue" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));

    await waitFor(() => {
      expect(mergeWatchlistsFnMock).toHaveBeenCalledWith({
        data: {
          sourceWatchlistIds: [1, 2, 3],
          newWatchlistName: "Merged Queue",
        },
      });
    });
  });
});
