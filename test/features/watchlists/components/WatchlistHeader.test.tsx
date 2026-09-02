// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@test/utils/Render";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Watchlist } from "@/db/Schema";
import { WatchlistHeader } from "@/features/watchlists/components/WatchlistHeader";

function watchlistFixture(pausedAt: string | null): Watchlist {
  return {
    id: 1,
    name: "Movie Night",
    description: null,
    itemOrderMode: "release",
    createdAt: "2024-01-01 00:00:00",
    updatedAt: null,
    lastWatchedAt: null,
    lastItemAddedAt: null,
    pausedAt,
  };
}

function renderHeader(pausedAt: string | null) {
  const onTogglePause = vi.fn();
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <WatchlistHeader
        watchlist={watchlistFixture(pausedAt)}
        totalItems={3}
        watchedItems={1}
        showUnwatchedOnly={false}
        onFilterChange={() => {}}
        searchQuery=""
        onSearchChange={() => {}}
        onTogglePause={onTogglePause}
      />
    </QueryClientProvider>,
  );
  return onTogglePause;
}

describe("WatchlistHeader", () => {
  afterEach(() => {
    cleanup();
  });

  it("offers pausing for an active watchlist", () => {
    const onTogglePause = renderHeader(null);

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));

    expect(onTogglePause).toHaveBeenCalledOnce();
  });

  it("offers resuming for a paused watchlist", () => {
    const onTogglePause = renderHeader("2024-06-01 00:00:00");

    fireEvent.click(screen.getByRole("button", { name: "Resume" }));

    expect(onTogglePause).toHaveBeenCalledOnce();
  });

  it("does not offer pausing to a paused watchlist", () => {
    renderHeader("2024-06-01 00:00:00");

    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
  });
});
