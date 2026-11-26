import { describe, expect, it } from "vitest";
import type { WatchlistItem } from "@/db/Schema";
import {
  buildTimelineRuns,
  buildWatchlistTimelineBlocks,
  buildWatchlistTimelineGroups,
} from "./WatchlistTimeline.model";

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

function timelineItem(
  id: number,
  {
    releaseDate = "2024-03-01",
    isWatched = false,
  }: { releaseDate?: string; isWatched?: boolean } = {},
): WatchlistItem {
  return { id, isWatched, releaseDate, title: `Item ${id}` } as WatchlistItem;
}

function blockSummary(blocks: ReturnType<typeof buildWatchlistTimelineBlocks>) {
  return blocks.map((block) => {
    if (block.kind === "year") return `year:${block.year}`;
    if (block.kind === "disclosure") return `disclosure:${block.runKey}:${block.expanded}`;
    return `item:${block.item.id}`;
  });
}

describe("watchlist timeline blocks", () => {
  it("groups release-mode items by year and keeps the group boundary on the last block", () => {
    const blocks = buildWatchlistTimelineBlocks({
      items: [
        timelineItem(1, { releaseDate: "2024-03-01" }),
        timelineItem(2, { releaseDate: "2024-07-01" }),
        timelineItem(3, { releaseDate: "2025-01-01" }),
      ],
      itemOrderMode: "release",
      unwatchedOnly: false,
      expandedRunKeys: new Set(),
    });

    expect(blockSummary(blocks)).toEqual(["year:2024", "item:1", "item:2", "year:2025", "item:3"]);
    expect(blocks.map((block) => block.groupEnd)).toEqual([false, false, true, false, true]);
  });

  it("omits year headings in custom order", () => {
    const blocks = buildWatchlistTimelineBlocks({
      items: [timelineItem(1), timelineItem(2)],
      itemOrderMode: "custom",
      unwatchedOnly: false,
      expandedRunKeys: new Set(),
    });

    expect(blockSummary(blocks)).toEqual(["item:1", "item:2"]);
  });

  it("collapses watched runs and expands them on demand", () => {
    const items = [
      timelineItem(1),
      timelineItem(2, { isWatched: true }),
      timelineItem(3, { isWatched: true }),
      timelineItem(4),
    ];

    const collapsed = buildWatchlistTimelineBlocks({
      items,
      itemOrderMode: "custom",
      unwatchedOnly: true,
      expandedRunKeys: new Set(),
    });
    expect(blockSummary(collapsed)).toEqual(["item:1", "disclosure:watched-run-2:false", "item:4"]);

    const runKey = collapsed.find((block) => block.kind === "disclosure")?.runKey ?? "";
    const expanded = buildWatchlistTimelineBlocks({
      items,
      itemOrderMode: "custom",
      unwatchedOnly: true,
      expandedRunKeys: new Set([runKey]),
    });
    expect(blockSummary(expanded)).toEqual([
      "item:1",
      "disclosure:watched-run-2:true",
      "item:2",
      "item:3",
      "item:4",
    ]);
  });

  it("keeps watched items inline once the unwatched filter is off", () => {
    const blocks = buildWatchlistTimelineBlocks({
      items: [timelineItem(1, { isWatched: true })],
      itemOrderMode: "custom",
      unwatchedOnly: false,
      expandedRunKeys: new Set(),
    });

    expect(blockSummary(blocks)).toEqual(["item:1"]);
  });
});

describe("buildWatchlistTimelineGroups", () => {
  it("returns an empty list for empty release-mode items", () => {
    expect(buildWatchlistTimelineGroups([], "release")).toEqual([]);
  });

  it("groups consecutive release years including TBA items while preserving order", () => {
    const groups = buildWatchlistTimelineGroups(
      [
        timelineItem(1, { releaseDate: "2024-01-01" }),
        timelineItem(2, { releaseDate: "2024-09-01" }),
        timelineItem(3, { releaseDate: "2025-05-01" }),
        { id: 4, isWatched: false, releaseDate: null, title: "Item 4" } as WatchlistItem,
      ],
      "release",
    );

    expect(groups.map((group) => [group.year, group.items.map((item) => item.id)])).toEqual([
      ["2024", [1, 2]],
      ["2025", [3]],
      ["TBA", [4]],
    ]);
  });

  it("groups large single-year lists without quadratic copying", () => {
    const largeList = Array.from({ length: 5000 }, (_, index) =>
      timelineItem(index + 1, { releaseDate: "2024-06-01" }),
    );

    const groups = buildWatchlistTimelineGroups(largeList, "release");

    expect(groups).toHaveLength(1);
    expect(groups[0]?.year).toBe("2024");
    expect(groups[0]?.items).toHaveLength(5000);
    expect(groups[0]?.items[0]?.id).toBe(1);
    expect(groups[0]?.items.at(-1)?.id).toBe(5000);
  });
});
