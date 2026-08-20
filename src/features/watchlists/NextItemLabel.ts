import type { WatchlistItem } from "@/db/Schema";

export function formatNextItemDetail(item: WatchlistItem): string {
  if (!item.episode) {
    return item.title;
  }

  if (!["episode", "anime"].includes(item.mediaType)) {
    return `${item.episode} • ${item.title}`;
  }

  return `${formatEpisodeMarker(item.season, item.episode)} • ${item.title}`;
}

export function formatNextItemWithParentTitle(item: WatchlistItem): string {
  const detail = formatNextItemDetail(item);
  if (!item.parentTitle) {
    return detail;
  }

  return formatParentDetail(item.parentTitle, item.title, detail);
}

function formatParentDetail(parentTitle: string, itemTitle: string, detail: string) {
  if (detail === itemTitle) {
    return parentTitle;
  }
  const [marker] = detail.split(" • ");
  return marker ? `${parentTitle} • ${marker}` : parentTitle;
}

function formatEpisodeMarker(season: number | null, episode: string) {
  if (season === null) {
    return `E${episode}`;
  }
  return `S${season}:E${episode}`;
}
