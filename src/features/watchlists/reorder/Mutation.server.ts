import { getDb, type DatabaseTransaction } from "@/db/Db.server";
import { watchlistItems, watchlists } from "@/db/Schema";
import { and, asc, eq, sql } from "drizzle-orm";
import type { ReorderItemsInput } from "./Schema";

export async function reorderItems({
  watchlistId,
  movedItemId,
  referenceItemId,
  position,
}: ReorderItemsInput) {
  const db = getDb();

  if (movedItemId === referenceItemId) {
    return { success: false, message: "Moved item and reference item must differ" };
  }

  return db.transaction((transaction) =>
    reorderItemsInTransaction(transaction, { watchlistId, movedItemId, referenceItemId, position }),
  );
}

function reorderItemsInTransaction(
  transaction: DatabaseTransaction,
  { watchlistId, movedItemId, referenceItemId, position }: ReorderItemsInput,
) {
  const [watchlist] = transaction
    .select({ itemOrderMode: watchlists.itemOrderMode })
    .from(watchlists)
    .where(eq(watchlists.id, watchlistId))
    .all();

  if (!watchlist || watchlist.itemOrderMode !== "custom") {
    return { success: false as const, message: "Reordering is only available in custom mode" };
  }

  const existingItems = transaction
    .select({
      id: watchlistItems.id,
      customRank: watchlistItems.customRank,
    })
    .from(watchlistItems)
    .where(eq(watchlistItems.watchlistId, watchlistId))
    .orderBy(
      sql`CASE WHEN ${watchlistItems.customRank} IS NULL THEN 1 ELSE 0 END`,
      asc(watchlistItems.customRank),
      asc(watchlistItems.id),
    )
    .all();
  return reorderExistingItems(transaction, existingItems, {
    watchlistId,
    movedItemId,
    referenceItemId,
    position,
  });
}

function reorderExistingItems(
  transaction: DatabaseTransaction,
  existingItems: Array<{ id: number; customRank: number | null }>,
  { watchlistId, movedItemId, referenceItemId, position }: ReorderItemsInput,
) {
  const validIds = new Set(existingItems.map((item) => item.id));
  if (!hasAllIds(validIds, [movedItemId, referenceItemId])) {
    return { success: false as const, message: "Some items do not belong to this watchlist" };
  }

  const orderedIds = existingItems.map((item) => item.id);
  const oldIndex = orderedIds.indexOf(movedItemId);
  const remainingIds = orderedIds.filter((itemId) => itemId !== movedItemId);
  const referenceIndex = remainingIds.indexOf(referenceItemId);

  if (!hasValidIndexes(oldIndex, referenceIndex)) {
    return { success: false as const, message: "Some items do not belong to this watchlist" };
  }

  return applyItemReorder(transaction, {
    watchlistId,
    movedItemId,
    position,
    oldIndex,
    referenceIndex,
    remainingIds,
  });
}

function hasAllIds(validIds: Set<number>, itemIds: number[]) {
  return itemIds.every((itemId) => validIds.has(itemId));
}

function hasValidIndexes(oldIndex: number, referenceIndex: number) {
  return oldIndex !== -1 && referenceIndex !== -1;
}

function applyItemReorder(
  transaction: DatabaseTransaction,
  {
    watchlistId,
    movedItemId,
    position,
    oldIndex,
    referenceIndex,
    remainingIds,
  }: Pick<ReorderItemsInput, "watchlistId" | "movedItemId" | "position"> & {
    oldIndex: number;
    referenceIndex: number;
    remainingIds: number[];
  },
) {
  const nextIndex = reorderInsertionIndex(position, referenceIndex);
  remainingIds.splice(nextIndex, 0, movedItemId);

  const reorderedIndex = remainingIds.indexOf(movedItemId);

  if (reorderedIndex === oldIndex) {
    return { success: true as const };
  }

  const sliceStart = Math.min(oldIndex, reorderedIndex);
  const sliceEnd = Math.max(oldIndex, reorderedIndex);
  const affectedIds = remainingIds.slice(sliceStart, sliceEnd + 1);
  updateAffectedRanks(transaction, watchlistId, affectedIds, sliceStart);

  return { success: true as const };
}

function updateAffectedRanks(
  transaction: DatabaseTransaction,
  watchlistId: number,
  affectedIds: number[],
  sliceStart: number,
) {
  for (const [offset, itemId] of affectedIds.entries()) {
    transaction
      .update(watchlistItems)
      .set({ customRank: sliceStart + offset + 1 })
      .where(and(eq(watchlistItems.id, itemId), eq(watchlistItems.watchlistId, watchlistId)))
      .run();
  }
}

function reorderInsertionIndex(position: ReorderItemsInput["position"], referenceIndex: number) {
  return position === "before" ? referenceIndex : referenceIndex + 1;
}
