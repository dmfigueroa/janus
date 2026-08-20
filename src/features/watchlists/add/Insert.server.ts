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

export async function persistAddedItems({
  watchlistId,
  items,
  insertionPosition,
}: {
  watchlistId: number;
  items: PendingWatchlistItem[];
  insertionPosition?: AddToWatchlistInsertionPosition;
}) {
  if (items.length === 0) {
    return { success: true, insertedCount: 0 } as const;
  }

  const db = getDb();

  return db.transaction((transaction) =>
    persistWatchlistItems({ transaction, watchlistId, items, insertionPosition }),
  );
}

function persistWatchlistItems({
  transaction,
  watchlistId,
  items,
  insertionPosition,
}: {
  transaction: DatabaseTransaction;
  watchlistId: number;
  items: PendingWatchlistItem[];
  insertionPosition?: AddToWatchlistInsertionPosition;
}) {
  const watchlist = getWatchlistById(watchlistId, transaction);

  if (!watchlist) {
    return { success: false, message: "Watchlist not found." } as const;
  }

  const result = insertItemsByOrderMode({
    transaction,
    watchlistId,
    items,
    itemOrderMode: watchlist.itemOrderMode,
    insertionPosition,
  });

  markLastItemAdded(transaction, watchlistId, result);
  return result;
}

function markLastItemAdded(
  transaction: DatabaseTransaction,
  watchlistId: number,
  result: ReturnType<typeof persistWatchlistItems>,
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
}: {
  transaction: DatabaseTransaction;
  watchlistId: number;
  items: PendingWatchlistItem[];
  itemOrderMode: typeof watchlists.$inferSelect.itemOrderMode;
  insertionPosition?: AddToWatchlistInsertionPosition;
}) {
  if (itemOrderMode !== "custom") {
    return insertWithReleaseDateOrder({ transaction, items });
  }

  if (!insertionPosition) {
    return { success: false, message: CUSTOM_ORDER_INSERTION_REQUIRED_MESSAGE } as const;
  }

  return insertWithCustomOrder({ transaction, watchlistId, items, insertionPosition });
}

function insertWithReleaseDateOrder({
  transaction,
  items,
}: {
  transaction: DatabaseTransaction;
  items: PendingWatchlistItem[];
}) {
  const inserted = transaction
    .insert(watchlistItems)
    .values(items)
    .onConflictDoNothing()
    .returning({ id: watchlistItems.id })
    .all();

  return { success: true, insertedCount: inserted.length } as const;
}
