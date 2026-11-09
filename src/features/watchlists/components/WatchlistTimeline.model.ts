import type { WatchlistItem } from "@/db/Schema";
import type { WatchlistItemOrderMode } from "@/features/watchlists/Order";

export interface WatchlistTimelineGroup {
  year: string;
  items: WatchlistItem[];
}

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
