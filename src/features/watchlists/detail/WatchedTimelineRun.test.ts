import { describe, expect, it } from "vitest";
import type { WatchlistItem } from "@/db/Schema";
import { buildTimelineRuns } from "./WatchedTimelineRun";

const items = [false, true, true, false, true].map(
  (isWatched, id) => ({ id, isWatched }) as WatchlistItem,
);

describe("watched timeline runs", () => {
  it("collapses consecutive watched items while preserving order and edge runs", () => {
    const runs = buildTimelineRuns(items, true);
    expect(runs.map((run) => [run.hidden, run.items.map((item) => item.id)])).toEqual([
      [false, [0]],
      [true, [1, 2]],
      [false, [3]],
      [true, [4]],
    ]);
    expect(items.map((item) => item.id)).toEqual([0, 1, 2, 3, 4]);
  });
  it("keeps every item visible with All selected", () => {
    expect(buildTimelineRuns(items, false).every((run) => !run.hidden)).toBe(true);
  });
  it("handles an empty list", () => {
    expect(buildTimelineRuns([], true)).toEqual([]);
  });
});
