// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@test/utils/Render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MergeWatchlistDialog } from "@/features/watchlists/merge/MergeWatchlistDialog";
import type { EnrichedWatchlist } from "@/features/watchlists/components/WatchlistCard";

const { invalidateMock, mergeWatchlistsFnMock, mergeWatchlistsServerFn, toasterMock } = vi.hoisted(
  () => ({
    invalidateMock: vi.fn(),
    mergeWatchlistsFnMock: vi.fn(),
    mergeWatchlistsServerFn: Symbol("mergeWatchlists"),
    toasterMock: { create: vi.fn() },
  }),
);

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

vi.mock("@/app/Toaster", () => ({ toaster: toasterMock }));

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
    pausedAt: overrides.pausedAt ?? null,
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
    fireEvent.click(screen.getByRole("button", { name: "Merge watchlists" }));

    await waitFor(() => {
      expect(mergeWatchlistsFnMock).toHaveBeenCalledWith({
        data: {
          sourceWatchlistIds: [1, 2, 3],
          newWatchlistName: "Merged Queue",
        },
      });
    });
  });

  it("submits the selected target when merging into an existing watchlist", async () => {
    render(
      <MergeWatchlistDialog
        open
        onOpenChange={vi.fn()}
        selectedWatchlistIds={[2, 1]}
        allWatchlists={[watchlist({ id: 1, name: "Alpha" }), watchlist({ id: 2, name: "Beta" })]}
      />,
    );

    fireEvent.click(screen.getByText("Merge into existing watchlist"));
    fireEvent.change(await screen.findByRole("combobox", { name: "Target watchlist" }), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Merge watchlists" }));

    await waitFor(() => {
      expect(mergeWatchlistsFnMock).toHaveBeenCalledWith({
        data: {
          sourceWatchlistIds: [2, 1],
          targetWatchlistId: 1,
        },
      });
    });
  });

  it("keeps entered values and the dialog actionable after a failed merge", async () => {
    mergeWatchlistsFnMock.mockResolvedValueOnce({
      success: false,
      message: "The watchlists could not be merged",
    });
    render(
      <MergeWatchlistDialog
        open
        onOpenChange={vi.fn()}
        selectedWatchlistIds={[1, 2]}
        allWatchlists={[watchlist({ id: 1, name: "Alpha" }), watchlist({ id: 2, name: "Beta" })]}
      />,
    );

    const nameInput = screen.getByPlaceholderText("New Watchlist Name");
    fireEvent.change(nameInput, { target: { value: "Merged Queue" } });
    fireEvent.click(screen.getByRole("button", { name: "Merge watchlists" }));

    await waitFor(() => {
      expect(toasterMock.create).toHaveBeenCalledWith({
        type: "error",
        title: "The watchlists could not be merged",
      });
    });
    expect((nameInput as HTMLInputElement).value).toBe("Merged Queue");
    expect(
      (screen.getByRole("button", { name: "Merge watchlists" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
  it("keeps dismissal controls disabled while merging and explains source removal", async () => {
    mergeWatchlistsFnMock.mockReturnValueOnce(new Promise(() => {}));
    render(
      <MergeWatchlistDialog
        open
        onOpenChange={vi.fn()}
        selectedWatchlistIds={[1, 2]}
        allWatchlists={[watchlist({ id: 1, name: "Alpha" }), watchlist({ id: 2, name: "Beta" })]}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("New Watchlist Name"), {
      target: { value: "Combined" },
    });
    expect(screen.getByRole("note").textContent).toContain(
      "All selected source watchlists will be removed",
    );
    fireEvent.click(screen.getByRole("button", { name: "Merge watchlists" }));
    await waitFor(() => {
      expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(
        true,
      );
      expect(
        (screen.getByRole("button", { name: "Close dialog" }) as HTMLButtonElement).disabled,
      ).toBe(true);
    });
  });
});
