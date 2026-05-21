import type { WatchlistItem } from "@/db/schema";

export function formatNextItemDetail(item: WatchlistItem): string {
  if (item.mediaType === "episode" || item.mediaType === "anime") {
    if (item.season !== null && item.episode) {
      return `S${item.season}:E${item.episode} • ${item.title}`;
    }

    if (item.episode) {
      return `E${item.episode} • ${item.title}`;
    }
  }

  if (item.episode) {
    return `${item.episode} • ${item.title}`;
  }

  return item.title;
}

export function formatNextItemWithParentTitle(item: WatchlistItem): string {
  const detail = formatNextItemDetail(item);
  if (!item.parentTitle) {
    return detail;
  }

  if (detail === item.title) {
    return item.parentTitle;
  }

  const [marker] = detail.split(" • ");
  return marker ? `${item.parentTitle} • ${marker}` : item.parentTitle;
}
