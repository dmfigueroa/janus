import type { WatchlistItem } from "@/db/Schema";
import type { WatchlistItemOrderMode } from "@/features/watchlists/Order";

export interface WatchlistTimelineGroup {
  year: string;
  items: WatchlistItem[];
}

export type WatchlistTimelineRun = {
  hidden: boolean;
  items: WatchlistItem[];
};

export type WatchlistTimelineBlock =
  | { kind: "year"; key: string; year: string; groupEnd: boolean }
  | {
      kind: "disclosure";
      key: string;
      year: string;
      runKey: string;
      count: number;
      expanded: boolean;
      groupEnd: boolean;
    }
  | { kind: "item"; key: string; year: string; item: WatchlistItem; groupEnd: boolean };

export function buildWatchlistTimelineGroups(
  items: WatchlistItem[],
  itemOrderMode: WatchlistItemOrderMode,
): WatchlistTimelineGroup[] {
  if (itemOrderMode === "custom") {
    return [{ year: "custom", items }];
  }

  const grouped: WatchlistTimelineGroup[] = [];
  let currentYear = "";
  let currentGroup: WatchlistItem[] = [];

  items.forEach((item) => {
    const year = getReleaseYear(item);
    const nextGroup = appendTimelineItem(grouped, currentYear, currentGroup, year, item);
    currentYear = nextGroup.year;
    currentGroup = nextGroup.items;
  });

  if (currentGroup.length > 0) {
    grouped.push({ year: currentYear, items: currentGroup });
  }

  return grouped;
}

/**
 * Flattens the timeline into single-height blocks so the list can virtualize one row model.
 * Collapsed watched runs stay one disclosure block; expanded runs emit their rows as
 * sibling blocks instead of nesting them, which keeps every mounted row bounded.
 */
export function buildWatchlistTimelineBlocks({
  items,
  itemOrderMode,
  unwatchedOnly,
  expandedRunKeys,
}: {
  items: WatchlistItem[];
  itemOrderMode: WatchlistItemOrderMode;
  unwatchedOnly: boolean;
  expandedRunKeys: ReadonlySet<string>;
}): WatchlistTimelineBlock[] {
  return buildWatchlistTimelineGroups(items, itemOrderMode).flatMap((group) =>
    buildGroupBlocks(group, unwatchedOnly, expandedRunKeys),
  );
}

export function buildTimelineRuns(
  items: WatchlistItem[],
  collapseWatched: boolean,
): WatchlistTimelineRun[] {
  return items.reduce<WatchlistTimelineRun[]>((runs, item) => {
    const hidden = [collapseWatched, Boolean(item.isWatched)].every(Boolean);
    const previous = runs.at(-1);
    if ([hidden, previous?.hidden].every(Boolean)) {
      previous!.items.push(item);
    } else {
      runs.push({ hidden, items: [item] });
    }
    return runs;
  }, []);
}

export function watchedRunKey(run: WatchlistTimelineRun) {
  return `watched-run-${run.items[0]?.id ?? "unknown"}`;
}

function buildGroupBlocks(
  group: WatchlistTimelineGroup,
  unwatchedOnly: boolean,
  expandedRunKeys: ReadonlySet<string>,
): WatchlistTimelineBlock[] {
  const headerBlocks = group.year === "custom" ? [] : [buildYearBlock(group.year)];
  const runBlocks = buildTimelineRuns(group.items, unwatchedOnly).flatMap((run) =>
    buildRunBlocks(run, group.year, expandedRunKeys),
  );
  const blocks = [...headerBlocks, ...runBlocks];
  const lastBlock = blocks.at(-1);

  return lastBlock ? [...blocks.slice(0, -1), { ...lastBlock, groupEnd: true }] : blocks;
}

function buildYearBlock(year: string): WatchlistTimelineBlock {
  return { kind: "year", key: `year-${year}`, year, groupEnd: false };
}

function buildRunBlocks(
  run: WatchlistTimelineRun,
  year: string,
  expandedRunKeys: ReadonlySet<string>,
): WatchlistTimelineBlock[] {
  const itemBlocks = run.items.map(
    (item): WatchlistTimelineBlock => ({
      kind: "item",
      key: `item-${item.id}`,
      year,
      item,
      groupEnd: false,
    }),
  );

  if (!run.hidden) {
    return itemBlocks;
  }

  const runKey = watchedRunKey(run);
  const expanded = expandedRunKeys.has(runKey);
  const disclosure: WatchlistTimelineBlock = {
    kind: "disclosure",
    key: `${runKey}-toggle`,
    year,
    runKey,
    count: run.items.length,
    expanded,
    groupEnd: false,
  };

  return expanded ? [disclosure, ...itemBlocks] : [disclosure];
}

function getReleaseYear(item: WatchlistItem) {
  return item.releaseDate ? item.releaseDate.split("-")[0] : "TBA";
}

function appendTimelineItem(
  grouped: WatchlistTimelineGroup[],
  currentYear: string,
  currentItems: WatchlistItem[],
  itemYear: string,
  item: WatchlistItem,
) {
  if (itemYear === currentYear) {
    return { year: currentYear, items: [...currentItems, item] };
  }

  appendCompletedGroup(grouped, currentYear, currentItems);
  return { year: itemYear, items: [item] };
}

function appendCompletedGroup(
  grouped: WatchlistTimelineGroup[],
  year: string,
  items: WatchlistItem[],
) {
  if (items.length > 0) {
    grouped.push({ year, items });
  }
}
