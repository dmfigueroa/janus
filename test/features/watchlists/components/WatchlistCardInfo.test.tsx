// @vitest-environment jsdom

import { cleanup, render, screen } from "@test/utils/Render";
import { afterEach, describe, expect, it } from "vitest";
import type { WatchlistSummary } from "@/features/watchlists/list/Query";
import { WatchlistCardInfo } from "@/features/watchlists/components/WatchlistCardInfo";

function watchlistSummary(overrides: Partial<WatchlistSummary>): WatchlistSummary {
  return {
    id: 1,
    name: "Resting List",
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
    ...overrides,
  };
}

describe("WatchlistCardInfo", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows when a paused watchlist was paused", () => {
    render(
      <WatchlistCardInfo
        watchlist={watchlistSummary({ pausedAt: "2024-06-01 12:30:00" })}
        infoVariant="watchlist"
      />,
    );

    expect(screen.getByText("Paused since June 1, 2024")).not.toBeNull();
  });

  it("omits the paused line for unpaused watchlists", () => {
    render(
      <WatchlistCardInfo
        watchlist={watchlistSummary({ pausedAt: null })}
        infoVariant="watchlist"
      />,
    );

    expect(screen.queryByText(/^Paused since/)).toBeNull();
  });

  it.each(["2024-06-01T12:30:00Z", "2024-06-01T12:30:00+00:00"])(
    "formats pausedAt timestamp %s that already includes a timezone suffix",
    (pausedAt) => {
      render(
        <WatchlistCardInfo watchlist={watchlistSummary({ pausedAt })} infoVariant="watchlist" />,
      );

      expect(screen.getByText("Paused since June 1, 2024")).not.toBeNull();
    },
  );
});
