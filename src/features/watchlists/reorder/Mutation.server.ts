import { getDb, type DatabaseTransaction } from "@/db/Db.server";
import { watchlistItems, watchlists } from "@/db/Schema";
import { and, asc, eq, sql } from "drizzle-orm";
import type { ReorderItemsInput } from "./Schema";

export type ReorderItemsResult =
  | { success: true }
  | { success: false; code: ReorderFailureCode; message: string };

export type ReorderFailureCode =
  | "not_found"
  | "not_custom_mode"
  | "invalid_reorder"
  | "invalid_item"
  | "invalid_reference";

export async function reorderItems({
  watchlistId,
  movedItemId,
  referenceItemId,
  position,
}: ReorderItemsInput): Promise<ReorderItemsResult> {
  const db = getDb();

  if (movedItemId === referenceItemId) {
    return {
      success: false,
      code: "invalid_reorder",
      message: "Moved item and reference item must differ",
    };
  }

  return db.transaction((transaction) =>
    reorderItemsInTransaction(transaction, { watchlistId, movedItemId, referenceItemId, position }),
  );
}

function reorderItemsInTransaction(
  transaction: DatabaseTransaction,
  { watchlistId, movedItemId, referenceItemId, position }: ReorderItemsInput,
): ReorderItemsResult {
  const [watchlist] = transaction
    .select({ itemOrderMode: watchlists.itemOrderMode })
    .from(watchlists)
    .where(eq(watchlists.id, watchlistId))
    .all();

  if (!watchlist) {
    return { success: false, code: "not_found", message: "Watchlist not found." };
  }

  if (watchlist.itemOrderMode !== "custom") {
    return {
      success: false,
      code: "not_custom_mode",
      message: "Reordering is only available in custom mode",
    };
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
): ReorderItemsResult {
  const missingItemError = findMissingItemError(existingItems, movedItemId, referenceItemId);
  if (missingItemError) return missingItemError;

  const orderedIds = existingItems.map((item) => item.id);
  const oldIndex = orderedIds.indexOf(movedItemId);
  const remainingIds = orderedIds.filter((itemId) => itemId !== movedItemId);
  const referenceIndex = remainingIds.indexOf(referenceItemId);

  return applyItemReorder(transaction, {
    watchlistId,
    movedItemId,
    position,
    oldIndex,
    referenceIndex,
    remainingIds,
  });
}

function findMissingItemError(
  existingItems: Array<{ id: number; customRank: number | null }>,
  movedItemId: number,
  referenceItemId: number,
) {
  const validIds = new Set(existingItems.map((item) => item.id));

  if (!validIds.has(movedItemId)) {
    return {
      success: false as const,
      code: "invalid_item" as const,
      message: "Moved item does not belong to this watchlist",
    };
  }

  if (!validIds.has(referenceItemId)) {
    return {
      success: false as const,
      code: "invalid_reference" as const,
      message: "Reference item does not belong to this watchlist",
    };
  }

  return null;
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
