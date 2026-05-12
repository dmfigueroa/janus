// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WatchlistItem } from "@/db/schema";
import { WatchlistTimeline } from "@/components/watchlist/WatchlistTimeline";

vi.mock("./TimelineItem", () => ({
  TimelineItem: ({ item }: { item: WatchlistItem }) => <div>{item.title}</div>,
}));

function item(
  overrides: Partial<WatchlistItem> & Pick<WatchlistItem, "id" | "title">,
): WatchlistItem {
  return {
    id: overrides.id,
    watchlistId: 1,
    tmdbId: overrides.tmdbId ?? String(overrides.id),
    source: "tmdb",
    mediaType: "movie",
    title: overrides.title,
    parentTitle: null,
    season: null,
    episode: null,
    posterPath: null,
    releaseDate: overrides.releaseDate ?? "2024-01-01",
    voteAverage: null,
    runtime: null,
    customRank: overrides.customRank ?? null,
    isWatched: false,
    addedAt: "2024-01-01 00:00:00",
  };
}

describe("WatchlistTimeline reorder controls", () => {
  beforeEach(() => {
    globalThis.IntersectionObserver = vi.fn(() => ({
      observe: vi.fn(),
      disconnect: vi.fn(),
      unobserve: vi.fn(),
      takeRecords: vi.fn(() => []),
      root: null,
      rootMargin: "",
      thresholds: [],
    })) as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    cleanup();
  });

  it("submits item ids in the dropped order when reordering is enabled", () => {
    const onReorder = vi.fn();

    render(
      <WatchlistTimeline
        items={[
          item({ id: 1, title: "First" }),
          item({ id: 2, title: "Second" }),
          item({ id: 3, title: "Third" }),
        ]}
        canReorder
        onReorder={onReorder}
      />,
    );

    fireEvent.dragStart(screen.getByRole("button", { name: "Move First" }));
    fireEvent.dragOver(screen.getByTestId("watchlist-timeline-row-3"));
    fireEvent.drop(screen.getByTestId("watchlist-timeline-row-3"));

    expect(onReorder).toHaveBeenCalledWith([2, 3, 1]);
  });

  it("keeps reorder controls disabled when reordering is unavailable", () => {
    render(
      <WatchlistTimeline
        items={[item({ id: 1, title: "First" }), item({ id: 2, title: "Second" })]}
        canReorder={false}
        onReorder={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Move First" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Move Second" })).toHaveProperty("disabled", true);
  });
});
