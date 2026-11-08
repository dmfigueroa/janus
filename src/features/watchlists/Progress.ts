import { isWatchlistCompleted } from "./lifecycle/WatchlistLifecycle";
export function calculateWatchlistProgress({
  totalItems,
  watchedItems,
}: {
  totalItems: number;
  watchedItems: number;
}) {
  if (isWatchlistCompleted({ totalItems, watchedItems })) return 100;
  return totalItems > 0 ? Math.min(99, Math.round((watchedItems / totalItems) * 100)) : 0;
}
