export type WatchlistMediaType =
  | "movie"
  | "episode"
  | "game"
  | "book"
  | "comic"
  | "anime"
  | "manga";

export type WatchlistTitle = {
  provider: string;
  providerId: string;
  mediaType: WatchlistMediaType;
  title: string;
  matchingItemCount: number;
};

export type WatchlistTitleSource = {
  source: string;
  tmdbId: string;
  mediaType: WatchlistMediaType;
  title: string;
  parentId: string | null;
  parentTitle: string | null;
};

export function collapseWatchlistItemsToTitles(items: WatchlistTitleSource[]): WatchlistTitle[] {
  const groups = items.reduce<Map<string, WatchlistTitle>>((titles, item) => {
    const title = watchlistTitleFromItem(item);
    const key = watchlistTitleGroupKey(title);
    const existing = titles.get(key);
    titles.set(
      key,
      existing ? { ...existing, matchingItemCount: existing.matchingItemCount + 1 } : title,
    );
    return titles;
  }, new Map());

  return [...groups.values()].sort(compareWatchlistTitles);
}

function watchlistTitleFromItem(item: WatchlistTitleSource): WatchlistTitle {
  return {
    provider: item.source,
    providerId: item.parentId ?? item.tmdbId,
    mediaType: item.mediaType,
    title: item.parentTitle ?? item.title,
    matchingItemCount: 1,
  };
}

function watchlistTitleGroupKey(title: WatchlistTitle) {
  return JSON.stringify([title.provider, title.providerId, title.mediaType, title.title]);
}

function compareWatchlistTitles(left: WatchlistTitle, right: WatchlistTitle) {
  return compareText(left.title, right.title) || compareText(left.providerId, right.providerId);
}

function compareText(left: string, right: string) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
