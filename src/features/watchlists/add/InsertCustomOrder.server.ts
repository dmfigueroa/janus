import type { DatabaseTransaction } from "@/db/Db.server";
import { watchlistItems } from "@/db/Schema";
import { customRankOrder } from "@/features/watchlists/Order.server";
import { and, asc, eq } from "drizzle-orm";
import { buildFinalOrder, orderPendingItemsByReleaseDate } from "./OrderInsertion";
import { assignCustomRanks, dedupePendingItems } from "./InsertOrder.server";
import type { AddToWatchlistInsertionPosition } from "./Mutation";

type PersistedWatchlistItem = Pick<
  typeof watchlistItems.$inferSelect,
  "id" | "tmdbId" | "mediaType" | "releaseDate" | "customRank"
>;

type PendingWatchlistItem = typeof watchlistItems.$inferInsert;

export function insertWithCustomOrder({
  transaction,
  watchlistId,
  items,
  insertionPosition,
}: {
  transaction: DatabaseTransaction;
  watchlistId: number;
  items: PendingWatchlistItem[];
  insertionPosition: AddToWatchlistInsertionPosition;
}) {
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
    return { success: true, insertedCount: 0 } as const;
  }

  executeCustomOrderWrites({ transaction, watchlistId, writes });

  return { success: true, insertedCount: writes.inserts.length } as const;
}

function computeCustomOrderInsertion({
  existingItems,
  pendingItems,
  insertionPosition,
}: {
  existingItems: PersistedWatchlistItem[];
  pendingItems: PendingWatchlistItem[];
  insertionPosition: AddToWatchlistInsertionPosition;
}): ReturnType<typeof assignCustomRanks> | null {
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
  transaction: DatabaseTransaction;
  watchlistId: number;
  writes: ReturnType<typeof assignCustomRanks>;
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
