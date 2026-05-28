import { getDb } from "@/db/db.server";
import { watchlistItems, watchlists } from "@/db/schema";
import { customRankOrder } from "@/features/watchlists/order.server";
import {
  markLastItemAddedInTransaction,
  type WatchlistTransaction,
} from "@/features/watchlists/repository.server";
import { toWatchlistItemKey } from "@/features/watchlists/item-key";
import { CUSTOM_ORDER_INSERTION_REQUIRED_MESSAGE } from "./constants";
import {
  buildFinalOrder,
  orderPendingItemsByReleaseDate,
  type OrderedWatchlistItem,
} from "./order-insertion";
import type { AddToWatchlistInsertionPosition } from "./mutation";
import { and, asc, eq } from "drizzle-orm";

type PersistedWatchlistItem = Pick<
  typeof watchlistItems.$inferSelect,
  "id" | "tmdbId" | "mediaType" | "releaseDate" | "customRank"
>;

type PendingWatchlistItem = typeof watchlistItems.$inferInsert;

type PendingWatchlistItemWithIndex = PendingWatchlistItem & { pendingIndex: number };

type PersistAddedItemsResult =
  | { success: true; insertedCount: number }
  | { success: false; message: string };

export async function persistAddedItems({
  watchlistId,
  items,
  insertionPosition,
}: {
  watchlistId: number;
  items: PendingWatchlistItem[];
  insertionPosition?: AddToWatchlistInsertionPosition;
}): Promise<PersistAddedItemsResult> {
  if (items.length === 0) {
    return { success: true, insertedCount: 0 };
  }

  const db = getDb();

  return db.transaction((transaction) => {
    const [watchlist] = transaction
      .select({ itemOrderMode: watchlists.itemOrderMode })
      .from(watchlists)
      .where(eq(watchlists.id, watchlistId))
      .limit(1)
      .all();

    if (!watchlist) {
      return { success: false, message: "Watchlist not found." };
    }

    if (watchlist.itemOrderMode !== "custom") {
      return insertWithReleaseDateOrder({ transaction, watchlistId, items });
    }

    if (!insertionPosition) {
      return { success: false, message: CUSTOM_ORDER_INSERTION_REQUIRED_MESSAGE };
    }

    return insertWithCustomOrder({ transaction, watchlistId, items, insertionPosition });
  });
}

function insertWithReleaseDateOrder({
  transaction,
  watchlistId,
  items,
}: {
  transaction: WatchlistTransaction;
  watchlistId: number;
  items: PendingWatchlistItem[];
}): PersistAddedItemsResult {
  const inserted = transaction
    .insert(watchlistItems)
    .values(items)
    .onConflictDoNothing()
    .returning({ id: watchlistItems.id })
    .all();

  if (inserted.length > 0) {
    markLastItemAddedInTransaction(transaction, watchlistId);
  }

  return { success: true, insertedCount: inserted.length };
}

function insertWithCustomOrder({
  transaction,
  watchlistId,
  items,
  insertionPosition,
}: {
  transaction: WatchlistTransaction;
  watchlistId: number;
  items: PendingWatchlistItem[];
  insertionPosition: AddToWatchlistInsertionPosition;
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
    insertionPosition,
  });

  if (!writes) {
    return { success: true, insertedCount: 0 };
  }

  executeCustomOrderWrites({ transaction, watchlistId, writes });
  markLastItemAddedInTransaction(transaction, watchlistId);

  return { success: true, insertedCount: writes.inserts.length };
}

function computeCustomOrderInsertion({
  existingItems,
  pendingItems,
  insertionPosition,
}: {
  existingItems: PersistedWatchlistItem[];
  pendingItems: PendingWatchlistItem[];
  insertionPosition: AddToWatchlistInsertionPosition;
}): {
  inserts: Array<{ item: PendingWatchlistItemWithIndex; rank: number }>;
  updates: Array<{ id: number; rank: number }>;
} | null {
  const dedupedItems = dedupePendingItems(pendingItems, existingItems);
  if (dedupedItems.length === 0) {
    return null;
  }

  const orderedPendingItems = orderPendingItemsByReleaseDate(dedupedItems);
  const finalOrder = buildFinalOrder({
    existingItems,
    pendingItems: orderedPendingItems,
    insertionPosition,
  });

  return assignCustomRanks(finalOrder);
}

function executeCustomOrderWrites({
  transaction,
  watchlistId,
  writes,
}: {
  transaction: WatchlistTransaction;
  watchlistId: number;
  writes: {
    inserts: Array<{ item: PendingWatchlistItemWithIndex; rank: number }>;
    updates: Array<{ id: number; rank: number }>;
  };
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

function assignCustomRanks(ordered: OrderedWatchlistItem[]): {
  inserts: Array<{ item: PendingWatchlistItemWithIndex; rank: number }>;
  updates: Array<{ id: number; rank: number }>;
} {
  const inserts: Array<{ item: PendingWatchlistItemWithIndex; rank: number }> = [];
  const updates: Array<{ id: number; rank: number }> = [];

  for (const [index, item] of ordered.entries()) {
    const rank = index + 1;

    if ("pendingIndex" in item) {
      inserts.push({ item: item as PendingWatchlistItemWithIndex, rank });
    } else {
      updates.push({ id: item.id, rank });
    }
  }

  return { inserts, updates };
}

function dedupePendingItems(
  items: PendingWatchlistItem[],
  existingItems: PersistedWatchlistItem[],
): PendingWatchlistItem[] {
  const existingKeys = new Set(existingItems.map(toWatchlistItemKey));
  const pendingKeys = new Set<string>();

  return items.filter((item) => {
    const itemKey = toWatchlistItemKey(item);
    if (existingKeys.has(itemKey) || pendingKeys.has(itemKey)) {
      return false;
    }

    pendingKeys.add(itemKey);
    return true;
  });
}
