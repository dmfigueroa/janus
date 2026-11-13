import { getDb, type DatabaseTransaction } from "@/db/Db.server";
import { watchlistItems, watchlists } from "@/db/Schema";
import { buildDetailOrderBy } from "@/features/watchlists/Order.server";
import { and, eq } from "drizzle-orm";
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

  // Reorder against the same ordering the timeline displays. Ordering by rank and id alone
  // disagrees with the detail query whenever ranks are duplicated or null, which would place
  // a dropped row somewhere other than where the user dropped it.
  const existingItems = transaction
    .select({
      id: watchlistItems.id,
      customRank: watchlistItems.customRank,
    })
    .from(watchlistItems)
    .where(eq(watchlistItems.watchlistId, watchlistId))
    .orderBy(...buildDetailOrderBy("custom"))
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

  const remainingIds = existingItems
    .map((item) => item.id)
    .filter((itemId) => itemId !== movedItemId);
  const referenceIndex = remainingIds.indexOf(referenceItemId);
  remainingIds.splice(reorderInsertionIndex(position, referenceIndex), 0, movedItemId);

  // Renumber the whole list, not just the moved slice. Duplicate and null ranks are what make
  // the next drop unpredictable, so a reorder also repairs the list into contiguous 1..N ranks.
  renumberRanks(transaction, watchlistId, existingItems, remainingIds);

  return { success: true as const };
}

function renumberRanks(
  transaction: DatabaseTransaction,
  watchlistId: number,
  existingItems: Array<{ id: number; customRank: number | null }>,
  orderedIds: number[],
) {
  const rankByItemId = new Map(existingItems.map((item) => [item.id, item.customRank]));

  orderedIds.forEach((itemId, index) => {
    const nextRank = index + 1;
    if (rankByItemId.get(itemId) === nextRank) return;

    transaction
      .update(watchlistItems)
      .set({ customRank: nextRank })
      .where(and(eq(watchlistItems.id, itemId), eq(watchlistItems.watchlistId, watchlistId)))
      .run();
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

function reorderInsertionIndex(position: ReorderItemsInput["position"], referenceIndex: number) {
  return position === "before" ? referenceIndex : referenceIndex + 1;
}
