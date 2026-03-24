export function calculateWatchlistProgress({
  totalItems,
  watchedItems,
}: {
  totalItems: number;
  watchedItems: number;
}) {
  return totalItems > 0 ? Math.round((watchedItems / totalItems) * 100) : 0;
}
