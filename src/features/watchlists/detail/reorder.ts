import type { WatchlistItemOrderMode } from "@/features/watchlists/order";
import type { WatchlistItem } from "@/db/schema";

export type DropPlacement = "before" | "after";
export type ReorderIntent = {
  movedItemId: number;
  referenceItemId: number;
  position: DropPlacement;
};

export function canReorderWatchlistItems({
  itemOrderMode,
  itemCount,
  isReorderPending,
  isWatchedTogglePending,
}: {
  itemOrderMode: WatchlistItemOrderMode;
  itemCount: number;
  isReorderPending: boolean;
  isWatchedTogglePending: boolean;
}) {
  return (
    itemOrderMode === "custom" && itemCount > 1 && !isReorderPending && !isWatchedTogglePending
  );
}

export function reorderVisibleItemsByAnchor<TItem extends Pick<WatchlistItem, "id">>({
  items,
  movedItemId,
  referenceItemId,
  position,
}: {
  items: TItem[];
  movedItemId: number;
  referenceItemId: number;
  position: DropPlacement;
}): number[] | null {
  const orderedIds = items.map((item) => item.id);

  if (movedItemId === referenceItemId) {
    return null;
  }

  const movedIndex = orderedIds.indexOf(movedItemId);
  if (movedIndex === -1) {
    return null;
  }

  const reorderedIds = orderedIds.filter((itemId) => itemId !== movedItemId);
  const referenceIndex = reorderedIds.indexOf(referenceItemId);
  if (referenceIndex === -1) {
    return null;
  }

  reorderedIds.splice(position === "before" ? referenceIndex : referenceIndex + 1, 0, movedItemId);

  if (reorderedIds.indexOf(movedItemId) === movedIndex) {
    return null;
  }

  return reorderedIds;
}

export function resolveReorderIntent({
  items,
  movedItemId,
  referenceItemId,
  position,
}: {
  items: Pick<WatchlistItem, "id">[];
  movedItemId: number;
  referenceItemId: number;
  position: DropPlacement;
}): ReorderIntent | null {
  const reorderedIds = reorderVisibleItemsByAnchor({
    items,
    movedItemId,
    referenceItemId,
    position,
  });

  if (!reorderedIds) {
    return null;
  }

  return { movedItemId, referenceItemId, position };
}
