import type { WatchlistItem } from "@/db/Schema";
import { calculateWatchlistProgress } from "@/features/watchlists/Progress";

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
  const cover = readSummaryCover(selection.coverItem);
  return {
    totalItems: counts.totalItems,
    watchedItems: counts.watchedItems,
    progress: calculateWatchlistProgress(counts),
    nextUnwatched: selection.nextUnwatched,
    coverImage: cover.image,
    coverMediaType: cover.mediaType,
  };
}

function readSummaryCover(coverItem: WatchlistItem | null) {
  if (!coverItem) {
    return { image: null, mediaType: null };
  }
  return {
    image: valueOrNull(coverItem.posterPath),
    mediaType: valueOrNull(coverItem.mediaType),
  };
}

function valueOrNull<T>(value: T | null | undefined) {
  return value ?? null;
}
