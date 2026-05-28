export function toWatchlistItemKey(item: { tmdbId: string; mediaType: string }) {
  return `${item.tmdbId}::${item.mediaType}`;
}
