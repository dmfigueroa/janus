import type { WatchlistWriteFailureCode } from "./AdditionOutcome";
import { getDb } from "@/db/Db.server";
import type { DatabaseTransaction } from "@/db/Db.server";
import { watchlistItems, watchlists } from "@/db/Schema";
import {
  getWatchlistById,
  markLastItemAddedInTransaction,
} from "@/features/watchlists/Repository.server";
import { CUSTOM_ORDER_INSERTION_REQUIRED_MESSAGE } from "./Constants";
import { insertWithCustomOrder } from "./InsertCustomOrder.server";
import type { AddToWatchlistInsertionPosition } from "./Mutation";

type PendingWatchlistItem = typeof watchlistItems.$inferInsert;

export type PersistAddedItemsResult =
  | { success: true; insertedCount: number }
  | {
      success: false;
      code: Extract<
        WatchlistWriteFailureCode,
        "not_found" | "insertion_choice_required" | "not_custom_mode" | "invalid_reference"
      >;
      message: string;
    };

export async function persistAddedItems({
  watchlistId,
  items,
  insertionPosition,
  referenceItemId,
}: {
  watchlistId: number;
  items: PendingWatchlistItem[];
  insertionPosition?: AddToWatchlistInsertionPosition;
  referenceItemId?: number;
}): Promise<PersistAddedItemsResult> {
  if (items.length === 0) {
    return { success: true, insertedCount: 0 } as const;
  }

  const db = getDb();

  return db.transaction((transaction) =>
    persistWatchlistItems({ transaction, watchlistId, items, insertionPosition, referenceItemId }),
  );
}

function persistWatchlistItems({
  transaction,
  watchlistId,
  items,
  insertionPosition,
  referenceItemId,
}: {
  transaction: DatabaseTransaction;
  watchlistId: number;
  items: PendingWatchlistItem[];
  insertionPosition?: AddToWatchlistInsertionPosition;
  referenceItemId?: number;
}): PersistAddedItemsResult {
  const watchlist = getWatchlistById(watchlistId, transaction);

  if (!watchlist) {
    return { success: false, code: "not_found", message: "Watchlist not found." } as const;
  }

  const result = insertItemsByOrderMode({
    transaction,
    watchlistId,
    items,
    itemOrderMode: watchlist.itemOrderMode,
    insertionPosition,
    referenceItemId,
  });

  markLastItemAdded(transaction, watchlistId, result);
  return result;
}

function markLastItemAdded(
  transaction: DatabaseTransaction,
  watchlistId: number,
  result: PersistAddedItemsResult,
) {
  if (!result.success || result.insertedCount === 0) {
    return;
  }

  markLastItemAddedInTransaction(transaction, watchlistId);
}

function insertItemsByOrderMode({
  transaction,
  watchlistId,
  items,
  itemOrderMode,
  insertionPosition,
  referenceItemId,
}: {
  transaction: DatabaseTransaction;
  watchlistId: number;
  items: PendingWatchlistItem[];
  itemOrderMode: typeof watchlists.$inferSelect.itemOrderMode;
  insertionPosition?: AddToWatchlistInsertionPosition;
  referenceItemId?: number;
}): PersistAddedItemsResult {
  if (itemOrderMode !== "custom") {
    return insertForReleaseOrder({ transaction, items, insertionPosition });
  }
  if (!insertionPosition) {
    return insertionChoiceRequired();
  }
  return insertWithCustomOrder({
    transaction,
    watchlistId,
    items,
    insertionPosition,
    referenceItemId,
  });
}

function insertForReleaseOrder({
  transaction,
  items,
  insertionPosition,
}: {
  transaction: DatabaseTransaction;
  items: PendingWatchlistItem[];
  insertionPosition?: AddToWatchlistInsertionPosition;
}): PersistAddedItemsResult {
  if (isAnchorPosition(insertionPosition)) {
    return notCustomModeFailure();
  }
  return insertWithReleaseDateOrder({ transaction, items });
}

function insertionChoiceRequired(): PersistAddedItemsResult {
  return {
    success: false,
    code: "insertion_choice_required",
    message: CUSTOM_ORDER_INSERTION_REQUIRED_MESSAGE,
  };
}

function notCustomModeFailure(): PersistAddedItemsResult {
  return {
    success: false,
    code: "not_custom_mode",
    message: "Anchored insertion is only available in custom mode.",
  };
}

function isAnchorPosition(
  position: AddToWatchlistInsertionPosition | undefined,
): position is "before" | "after" {
  return position === "before" || position === "after";
}

function insertWithReleaseDateOrder({
  transaction,
  items,
}: {
  transaction: DatabaseTransaction;
  items: PendingWatchlistItem[];
}): PersistAddedItemsResult {
  const inserted = transaction
    .insert(watchlistItems)
    .values(items)
    .onConflictDoNothing()
    .returning({ id: watchlistItems.id })
    .all();

  return { success: true, insertedCount: inserted.length } as const;
}
