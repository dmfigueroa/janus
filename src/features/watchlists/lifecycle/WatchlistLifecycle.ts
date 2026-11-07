type WatchlistCounts = { totalItems: number; watchedItems: number };

export function isWatchlistCompleted(counts: WatchlistCounts) {
  return counts.totalItems > 0 && counts.watchedItems === counts.totalItems;
}

/** Pause is independent of contents; grouping never changes the persisted pause. */
export function readWatchlistLifecycle(watchlist: {
  pausedAt: string | null;
  stats: WatchlistCounts;
}) {
  const empty = watchlist.stats.totalItems === 0;
  const completed = isWatchlistCompleted(watchlist.stats);
  const paused = watchlist.pausedAt !== null;
  const section =
    (
      [
        [empty, "empty"],
        [completed, "completed"],
        [paused, "paused"],
      ] as const
    ).find(([matches]) => matches)?.[1] ?? "rotation";
  const eligible = section === "rotation";
  return { empty, completed, paused, eligible, section } as const;
}
