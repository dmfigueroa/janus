import type { Watchlist, WatchlistItem } from "@/db/Schema";

export type WatchlistItemOrderMode = Watchlist["itemOrderMode"];

export type InsertionPosition = "beginning" | "end" | "before" | "after";

export function compareReleaseDates(
  left: { id: number; releaseDate?: string | null },
  right: { id: number; releaseDate?: string | null },
) {
  const releaseComparison = compareNullableReleaseDates(left.releaseDate, right.releaseDate);
  return releaseComparison || left.id - right.id;
}

function compareNullableReleaseDates(
  left: string | null | undefined,
  right: string | null | undefined,
): number {
  const leftNorm = normalizeReleaseDate(left);
  const rightNorm = normalizeReleaseDate(right);

  if (leftNorm === null) return compareMissingLeftValue(rightNorm);
  if (rightNorm === null) return -1;
  return leftNorm.localeCompare(rightNorm);
}

function normalizeReleaseDate(releaseDate: string | null | undefined) {
  const normalized = releaseDate?.trim();
  return normalized ? normalized : null;
}

function compareMissingLeftValue(right: unknown) {
  return right === null ? 0 : 1;
}

function compareNullableRanks(left: number | null, right: number | null) {
  if (left === null) return compareMissingLeftValue(right);
  if (right === null) return -1;
  return left - right;
}

export function compareItemsByOrderMode(
  left: WatchlistItem,
  right: WatchlistItem,
  itemOrderMode: WatchlistItemOrderMode,
) {
  if (itemOrderMode === "custom") {
    const rankComparison = compareNullableRanks(left.customRank, right.customRank);
    return rankComparison || compareReleaseDates(left, right);
  }

  return compareReleaseDates(left, right);
}
