import type { WatchlistItem } from "@/db/schema";
import { calculateWatchlistProgress } from "@/features/watchlists/progress";

export type WatchlistStats = {
  totalItems: number;
  watchedItems: number;
  progress: number;
  nextUnwatched: WatchlistItem | null;
  coverImage: string | null;
  coverMediaType: WatchlistItem["mediaType"] | null;
};

export type SummaryCounts = Pick<WatchlistStats, "totalItems" | "watchedItems">;
export type SummarySelection = {
  nextUnwatched: WatchlistItem | null;
  coverItem: WatchlistItem | null;
};

export const emptySummaryCounts: SummaryCounts = {
  totalItems: 0,
  watchedItems: 0,
};

export const emptySummarySelection: SummarySelection = {
  nextUnwatched: null,
  coverItem: null,
};

export function buildSummaryStats(
  counts: SummaryCounts,
  selection: SummarySelection,
): WatchlistStats {
  return {
    totalItems: counts.totalItems,
    watchedItems: counts.watchedItems,
    progress: calculateWatchlistProgress(counts),
    nextUnwatched: selection.nextUnwatched,
    coverImage: selection.coverItem?.posterPath ?? null,
    coverMediaType: selection.coverItem?.mediaType ?? null,
  };
}
