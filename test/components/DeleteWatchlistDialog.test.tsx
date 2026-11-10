// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Provider } from "@/app/Provider";
import type { EnrichedWatchlist } from "@/features/watchlists/components/WatchlistCard";
import { DeleteWatchlistDialog } from "@/features/watchlists/components/DeleteWatchlistDialog";

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

describe("DeleteWatchlistDialog", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("lets users confirm deletion from an accessible alert dialog", async () => {
    const handleDelete = vi.fn();

    render(
      <Provider>
        <DeleteWatchlistDialog
          watchlist={watchlist()}
          open
          onOpenChange={() => {}}
          deleting={false}
          handleDelete={handleDelete}
        />
      </Provider>,
    );

    const dialog = await waitFor(() => screen.getByRole("alertdialog"));

    expect(dialog.textContent).toContain("permanently deletes");
    const button = screen.getByRole("button", { name: "Delete watchlist" }) as HTMLButtonElement;
    const input = screen.getByRole("textbox", { name: /watchlist name/i });
    expect(button.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "movie night" } });
    expect(button.disabled).toBe(true);
    fireEvent.change(input, { target: { value: " Movie Night " } });
    expect(button.disabled).toBe(false);
    fireEvent.click(button);

    expect(handleDelete).toHaveBeenCalledOnce();
  });

  it("copies the watchlist name for pasting into the confirmation", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(
      <Provider>
        <DeleteWatchlistDialog
          watchlist={watchlist()}
          open
          onOpenChange={vi.fn()}
          deleting={false}
          handleDelete={vi.fn()}
        />
      </Provider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Copy watchlist name" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Movie Night"));
    expect(await screen.findByText("Watchlist name copied")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Delete watchlist" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    vi.unstubAllGlobals();
  });

  it("keeps confirmation and controls disabled while deletion is pending", async () => {
    const { rerender } = render(
      <Provider>
        <DeleteWatchlistDialog
          watchlist={watchlist()}
          open
          onOpenChange={vi.fn()}
          deleting={false}
          handleDelete={vi.fn()}
        />
      </Provider>,
    );
    const input = (await screen.findByRole("textbox", {
      name: /watchlist name/i,
    })) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Movie Night" } });
    rerender(
      <Provider>
        <DeleteWatchlistDialog
          watchlist={watchlist()}
          open
          onOpenChange={vi.fn()}
          deleting
          handleDelete={vi.fn()}
        />
      </Provider>,
    );
    expect(input.disabled).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Copy watchlist name" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Deleting..." }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    rerender(
      <Provider>
        <DeleteWatchlistDialog
          watchlist={watchlist()}
          open
          onOpenChange={vi.fn()}
          deleting={false}
          handleDelete={vi.fn()}
        />
      </Provider>,
    );
    expect(input.value).toBe("Movie Night");
    expect(
      (screen.getByRole("button", { name: "Delete watchlist" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("clears the typed name when the dialog closes", async () => {
    const { rerender } = render(
      <Provider>
        <DeleteWatchlistDialog
          watchlist={watchlist()}
          open
          onOpenChange={vi.fn()}
          deleting={false}
          handleDelete={vi.fn()}
        />
      </Provider>,
    );
    const input = await screen.findByRole("textbox", { name: /watchlist name/i });
    fireEvent.change(input, { target: { value: "Movie Night" } });
    rerender(
      <Provider>
        <DeleteWatchlistDialog
          watchlist={watchlist()}
          open={false}
          onOpenChange={vi.fn()}
          deleting={false}
          handleDelete={vi.fn()}
        />
      </Provider>,
    );
    rerender(
      <Provider>
        <DeleteWatchlistDialog
          watchlist={watchlist()}
          open
          onOpenChange={vi.fn()}
          deleting={false}
          handleDelete={vi.fn()}
        />
      </Provider>,
    );
    expect(
      ((await screen.findByRole("textbox", { name: /watchlist name/i })) as HTMLInputElement).value,
    ).toBe("");
  });

  it("stacks the dialog title and description vertically", async () => {
    render(
      <Provider>
        <DeleteWatchlistDialog
          watchlist={watchlist()}
          open
          onOpenChange={() => {}}
          deleting={false}
          handleDelete={vi.fn()}
        />
      </Provider>,
    );

    const title = await waitFor(() => screen.getByRole("heading", { name: "Delete watchlist?" }));
    const header = title.parentElement;

    expect(header).not.toBeNull();
    expect(window.getComputedStyle(header as HTMLElement).flexDirection).toBe("column");
  });
});
