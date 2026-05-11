import type { WatchlistItem } from "@/db/schema";

export type WatchlistItemOrderMode = "release" | "custom";

export function compareReleaseDates(
  left: Pick<WatchlistItem, "id" | "releaseDate">,
  right: Pick<WatchlistItem, "id" | "releaseDate">,
) {
  const leftReleaseDate = left.releaseDate?.trim() || null;
  const rightReleaseDate = right.releaseDate?.trim() || null;

  if (leftReleaseDate === null && rightReleaseDate === null) {
    return left.id - right.id;
  }

  if (leftReleaseDate === null) {
    return 1;
  }

  if (rightReleaseDate === null) {
    return -1;
  }

  return leftReleaseDate.localeCompare(rightReleaseDate) || left.id - right.id;
}

export function compareItemsByOrderMode(
  left: WatchlistItem,
  right: WatchlistItem,
  itemOrderMode: WatchlistItemOrderMode,
) {
  if (itemOrderMode === "custom") {
    const leftRank = left.customRank;
    const rightRank = right.customRank;

    if (leftRank === null && rightRank === null) {
      return compareReleaseDates(left, right);
    }

    if (leftRank === null) {
      return 1;
    }

    if (rightRank === null) {
      return -1;
    }

    return leftRank - rightRank || compareReleaseDates(left, right);
  }

  return compareReleaseDates(left, right);
}
