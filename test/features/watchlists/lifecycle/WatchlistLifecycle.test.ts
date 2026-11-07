import { describe, expect, it } from "vitest";
import { readWatchlistLifecycle } from "@/features/watchlists/lifecycle/WatchlistLifecycle";
import { calculateWatchlistProgress } from "@/features/watchlists/Progress";

describe("watchlist lifecycle", () => {
  it.each([
    { totalItems: 0, watchedItems: 0, pausedAt: null, section: "empty", eligible: false },
    { totalItems: 0, watchedItems: 0, pausedAt: "2024-01-01", section: "empty", eligible: false },
    { totalItems: 200, watchedItems: 199, pausedAt: null, section: "rotation", eligible: true },
    {
      totalItems: 200,
      watchedItems: 199,
      pausedAt: "2024-01-01",
      section: "paused",
      eligible: false,
    },
    { totalItems: 200, watchedItems: 200, pausedAt: null, section: "completed", eligible: false },
    {
      totalItems: 200,
      watchedItems: 200,
      pausedAt: "2024-01-01",
      section: "completed",
      eligible: false,
    },
  ])(
    "classifies $totalItems/$watchedItems paused=$pausedAt",
    ({ totalItems, watchedItems, pausedAt, section, eligible }) => {
      expect(
        readWatchlistLifecycle({ pausedAt, stats: { totalItems, watchedItems } }),
      ).toMatchObject({ section, eligible, paused: pausedAt !== null });
    },
  );

  it("reserves 100 percent for exact completion", () => {
    expect(calculateWatchlistProgress({ totalItems: 200, watchedItems: 199 })).toBe(99);
    expect(calculateWatchlistProgress({ totalItems: 200, watchedItems: 200 })).toBe(100);
    expect(calculateWatchlistProgress({ totalItems: 0, watchedItems: 0 })).toBe(0);
  });
});
