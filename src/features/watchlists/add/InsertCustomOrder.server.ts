import type { DatabaseTransaction } from "@/db/Db.server";
import { watchlistItems } from "@/db/Schema";
import { customRankOrder } from "@/features/watchlists/Order.server";
import { and, asc, eq } from "drizzle-orm";
import type { InsertionPosition } from "@/features/watchlists/Order";
import {
  buildFinalOrder,
  orderPendingItemsByReleaseDate,
  type AnchoredOrderFailure,
} from "./OrderInsertion";
import { assignCustomRanks, dedupePendingItems } from "./InsertOrder.server";
import type { AddToWatchlistInsertionPosition } from "./Mutation";

type PersistedWatchlistItem = Pick<
  typeof watchlistItems.$inferSelect,
  "id" | "tmdbId" | "mediaType" | "releaseDate" | "customRank"
>;

type PendingWatchlistItem = typeof watchlistItems.$inferInsert;

export type InsertWithCustomOrderFailure = Extract<AnchoredOrderFailure, { success: false }>;

export function insertWithCustomOrder({
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
}):
  | { success: true; insertedCount: number }
  | { success: false; code: InsertWithCustomOrderFailure["code"]; message: string } {
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

function computeCustomOrderInsertion({
  existingItems,
  pendingItems,
  insertionPosition,
  referenceItemId,
}: {
  existingItems: PersistedWatchlistItem[];
  pendingItems: PendingWatchlistItem[];
  insertionPosition: InsertionPosition;
  referenceItemId?: number;
}):
  | ReturnType<typeof assignCustomRanks>
  | null
  | { failure: { success: false; code: InsertWithCustomOrderFailure["code"]; message: string } } {
  const dedupedItems = dedupePendingItems(pendingItems, existingItems);
  if (dedupedItems.length === 0) {
    return null;
  }

  const orderedPendingItems = orderPendingItemsByReleaseDate(dedupedItems);
  const finalOrder = buildFinalOrder({
    existingItems,
    pendingInsertions: orderedPendingItems.map((pendingItem) => ({
      pendingItem,
      insertionPosition,
      referenceItemId,
    })),
  });

  if (!Array.isArray(finalOrder)) {
    return {
      failure: {
        success: false,
        code: finalOrder.code,
        message: anchorFailureMessage(finalOrder.code, finalOrder.referenceItemId),
      },
    };
  }

  return assignCustomRanks(finalOrder);
}

function anchorFailureMessage(code: AnchoredOrderFailure["code"], referenceItemId: number): string {
  if (code === "invalid_reference") {
    return Number.isNaN(referenceItemId)
      ? "Reference item is required for anchored insertion."
      : `Reference item ${referenceItemId} is not in this watchlist.`;
  }
  return "Anchored insertion is not available.";
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
