import type { WatchlistWriteFailureCode } from "./AdditionOutcome";
import { getDb, type DatabaseTransaction } from "@/db/Db.server";
import { watchlistItems } from "@/db/Schema";
import { and, asc, eq } from "drizzle-orm";
import {
  getWatchlistById,
  markLastItemAddedInTransaction,
} from "@/features/watchlists/Repository.server";
import { customRankOrder } from "@/features/watchlists/Order.server";
import type { InsertionPosition } from "@/features/watchlists/Order";
import type { AddToWatchlistInsertionPosition } from "./Mutation";
import { validateAdditionDestination } from "./AdditionDestination";
import {
  computeCustomOrderInsertion,
  type CustomOrderWrites,
  type PendingWatchlistItem,
} from "./InsertionOrder";

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

  const validationFailure = validateAdditionDestination({ watchlist, insertionPosition });
  if (validationFailure) {
    return { success: false, code: validationFailure.code, message: validationFailure.message };
  }

  const result = insertItemsByOrderMode({
    transaction,
    watchlistId,
    items,
    itemOrderMode: watchlist!.itemOrderMode,
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
  itemOrderMode: "release" | "custom";
  insertionPosition?: AddToWatchlistInsertionPosition;
  referenceItemId?: number;
}): PersistAddedItemsResult {
  if (itemOrderMode === "custom") {
    return insertWithCustomOrder({
      transaction,
      watchlistId,
      items,
      insertionPosition: insertionPosition!,
      referenceItemId,
    });
  }

  return insertWithReleaseDateOrder({ transaction, items });
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

function insertWithCustomOrder({
  transaction,
  watchlistId,
  items,
  insertionPosition,
  referenceItemId,
}: {
  transaction: DatabaseTransaction;
  watchlistId: number;
  items: PendingWatchlistItem[];
  insertionPosition: AddToWatchlistInsertionPosition;
  referenceItemId?: number;
}): PersistAddedItemsResult {
  const existingItems = transaction
    .select({
      id: watchlistItems.id,
      tmdbId: watchlistItems.tmdbId,
      mediaType: watchlistItems.mediaType,
      releaseDate: watchlistItems.releaseDate,
      customRank: watchlistItems.customRank,
    })
    .from(watchlistItems)
    .where(eq(watchlistItems.watchlistId, watchlistId))
    .orderBy(...customRankOrder, asc(watchlistItems.id))
    .all();

  const writes = computeCustomOrderInsertion({
    existingItems,
    pendingItems: items,
    insertionPosition: insertionPosition as InsertionPosition,
    referenceItemId,
  });

  if (!writes) {
    return { success: true, insertedCount: 0 } as const;
  }

  if ("failure" in writes) {
    return writes.failure;
  }

  executeCustomOrderWrites({ transaction, watchlistId, writes });

  return { success: true, insertedCount: writes.inserts.length } as const;
}

function executeCustomOrderWrites({
  transaction,
  watchlistId,
  writes,
}: {
  transaction: DatabaseTransaction;
  watchlistId: number;
  writes: CustomOrderWrites;
}): void {
  for (const { item, rank } of writes.inserts) {
    transaction
      .insert(watchlistItems)
      .values({ ...item, customRank: rank })
      .run();
  }

  for (const { id, rank } of writes.updates) {
    transaction
      .update(watchlistItems)
      .set({ customRank: rank })
      .where(and(eq(watchlistItems.id, id), eq(watchlistItems.watchlistId, watchlistId)))
      .run();
  }
}
