// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@test/utils/Render";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Watchlist } from "@/db/Schema";
import { WatchlistHeader } from "@/features/watchlists/components/WatchlistHeader";

function watchlistFixture(pausedAt: string | null, description: string | null = null): Watchlist {
  return {
    id: 1,
    name: "Movie Night",
    description,
    itemOrderMode: "release",
    createdAt: "2024-01-01 00:00:00",
    updatedAt: null,
    lastWatchedAt: null,
    lastItemAddedAt: null,
    pausedAt,
  };
}

function renderHeader(pausedAt: string | null, description: string | null = null) {
  const onTogglePause = vi.fn();
  const onDelete = vi.fn();
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <WatchlistHeader
        watchlist={watchlistFixture(pausedAt, description)}
        totalItems={3}
        watchedItems={1}
        showUnwatchedOnly={false}
        onFilterChange={() => {}}
        searchQuery=""
        onSearchChange={() => {}}
        onTogglePause={onTogglePause}
        onDelete={onDelete}
      />
    </QueryClientProvider>,
  );
  return { onTogglePause, onDelete };
}

describe("WatchlistHeader", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("wires the delete action to its callback", () => {
    const { onDelete } = renderHeader(null);
    fireEvent.click(screen.getByRole("button", { name: "Delete watchlist" }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("offers pausing for an active watchlist", () => {
    const { onTogglePause } = renderHeader(null);

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));

    expect(onTogglePause).toHaveBeenCalledOnce();
  });

  it("offers resuming for a paused watchlist", () => {
    const { onTogglePause } = renderHeader("2024-06-01 00:00:00");

    fireEvent.click(screen.getByRole("button", { name: "Resume" }));

    expect(onTogglePause).toHaveBeenCalledOnce();
  });

  it("does not offer pausing to a paused watchlist", () => {
    renderHeader("2024-06-01 00:00:00");

    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
  });

  it("places a long description below the title controls", () => {
    renderHeader(
      null,
      "A completionist chronology containing every release, overlapping collection, and omnibus.",
    );

    const heading = screen.getByRole("heading", { name: "Movie Night" });
    const description = screen.getByText(/A completionist chronology/);

    const titleLayout = heading.parentElement?.parentElement;

    expect(description.parentElement).toBe(titleLayout);
    expect(getComputedStyle(titleLayout!).flexDirection).toBe("column");
  });

  it("expands and collapses descriptions that exceed three lines", () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(80);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(60);

    renderHeader(
      null,
      "A completionist chronology containing every release, overlapping collection, and omnibus.",
    );

    const description = screen.getByText(/A completionist chronology/);
    const showMoreButton = screen.getByText("Show more");

    expect(getComputedStyle(description).webkitLineClamp).toBe("3");
    expect(showMoreButton.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(showMoreButton);

    expect(getComputedStyle(description).webkitLineClamp).not.toBe("3");
    expect(screen.getByText("Show less").getAttribute("aria-expanded")).toBe("true");
  });

  it("does not show an expansion control when the description fits", () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(60);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(60);

    renderHeader(null, "Short description");

    expect(screen.queryByText("Show more")).toBeNull();
  });
});
