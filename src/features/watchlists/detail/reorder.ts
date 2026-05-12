import type { WatchlistItem } from "@/db/schema";
import type { WatchlistItemOrderMode } from "@/features/watchlists/order";
import type { WatchlistDetailQueryKeyFilters } from "@/features/watchlists/detail/query";

export type DropPlacement = "before" | "after";

export function canReorderWatchlistItems({
  itemOrderMode,
  showUnwatchedOnly,
  searchQuery,
  debouncedSearchQuery,
  hasNextPage,
  itemCount,
  isReorderPending,
}: {
  itemOrderMode: WatchlistItemOrderMode;
  showUnwatchedOnly: boolean;
  searchQuery: string;
  debouncedSearchQuery: string;
  hasNextPage: boolean | undefined;
  itemCount: number;
  isReorderPending: boolean;
}) {
  return (
    itemOrderMode === "custom" &&
    !showUnwatchedOnly &&
    searchQuery.trim().length === 0 &&
    debouncedSearchQuery.length === 0 &&
    hasNextPage === false &&
    itemCount > 1 &&
    !isReorderPending
  );
}

export function isFullCustomWatchlistDetailQuery(
  filters: Partial<WatchlistDetailQueryKeyFilters> | null,
) {
  return filters?.itemOrderMode === "custom" && filters.unwatchedOnly === false && !filters.query;
}

export function orderItemIdsAfterDrop({
  items,
  draggedItemId,
  targetItemId,
  placement,
}: {
  items: Pick<WatchlistItem, "id">[];
  draggedItemId: number;
  targetItemId: number;
  placement: DropPlacement;
}) {
  if (draggedItemId === targetItemId) {
    return null;
  }

  const reorderedIds = items.map((item) => item.id).filter((itemId) => itemId !== draggedItemId);
  const targetIndex = reorderedIds.indexOf(targetItemId);

  if (targetIndex === -1) {
    return null;
  }

  reorderedIds.splice(placement === "before" ? targetIndex : targetIndex + 1, 0, draggedItemId);
  return reorderedIds;
}
