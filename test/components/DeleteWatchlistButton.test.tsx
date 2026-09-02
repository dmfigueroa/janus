// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Provider } from "@/app/Provider";
import type { EnrichedWatchlist } from "@/features/watchlists/components/WatchlistCard";
import { DeleteWatchlistButton } from "@/features/watchlists/components/DeleteWatchlistButton";

function watchlist(): EnrichedWatchlist {
  return {
    id: 1,
    name: "Movie Night",
    description: null,
    itemOrderMode: "release",
    createdAt: "2024-01-01 00:00:00",
    updatedAt: null,
    lastWatchedAt: null,
    lastItemAddedAt: null,
    pausedAt: null,
    stats: {
      totalItems: 1,
      watchedItems: 0,
      progress: 0,
      nextUnwatched: null,
      coverImage: null,
      coverMediaType: null,
    },
  };
}

describe("DeleteWatchlistButton", () => {
  afterEach(() => {
    cleanup();
  });

  it("lets users confirm deletion from an accessible alert dialog", async () => {
    const handleDelete = vi.fn();

    render(
      <Provider>
        <DeleteWatchlistButton
          watchlist={watchlist()}
          deleting={false}
          handleDelete={handleDelete}
        />
      </Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete Movie Night" }));

    const dialog = await waitFor(() => screen.getByRole("alertdialog"));

    expect(dialog.textContent).toContain(
      'Are you sure you want to delete "Movie Night"? This action cannot be undone.',
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(handleDelete).toHaveBeenCalledOnce();
  });

  it("stacks the dialog title and description vertically", async () => {
    render(
      <Provider>
        <DeleteWatchlistButton watchlist={watchlist()} deleting={false} handleDelete={vi.fn()} />
      </Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete Movie Night" }));

    const title = await waitFor(() => screen.getByRole("heading", { name: "Delete Watchlist" }));
    const header = title.parentElement;

    expect(header).not.toBeNull();
    expect(window.getComputedStyle(header as HTMLElement).flexDirection).toBe("column");
  });
});
