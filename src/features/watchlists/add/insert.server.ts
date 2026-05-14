import { getDb } from "@/db/db.server";
import { watchlistItems, watchlists } from "@/db/schema";
import { compareReleaseDates } from "@/features/watchlists/order";
import type { AddToWatchlistInsertionPosition } from "./mutation";
import { and, asc, eq, sql } from "drizzle-orm";

type PersistedWatchlistItem = Pick<
  typeof watchlistItems.$inferSelect,
  "id" | "tmdbId" | "mediaType" | "releaseDate" | "customRank"
>;

type PendingWatchlistItem = typeof watchlistItems.$inferInsert;

type PendingWatchlistItemWithIndex = PendingWatchlistItem & {
  pendingIndex: number;
};

type OrderedWatchlistItem = PersistedWatchlistItem | PendingWatchlistItemWithIndex;

type PersistAddedItemsResult =
  | { success: true; insertedCount: number }
  | { success: false; message: string };

const CUSTOM_ORDER_INSERTION_REQUIRED_MESSAGE =
  "Choose where to insert this item in the custom order.";

export function getCustomOrderInsertionRequiredMessage() {
  return CUSTOM_ORDER_INSERTION_REQUIRED_MESSAGE;
}

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

  return db.transaction((tx) => {
    const [watchlist] = tx
      .select({ itemOrderMode: watchlists.itemOrderMode })
      .from(watchlists)
      .where(eq(watchlists.id, watchlistId))
      .limit(1)
      .all();

    if (!watchlist) {
      return { success: false, message: "Watchlist not found." };
    }

    if (watchlist.itemOrderMode !== "custom") {
      const inserted = tx
        .insert(watchlistItems)
        .values(items)
        .onConflictDoNothing()
        .returning({ id: watchlistItems.id })
        .all();

      if (inserted.length > 0) {
        tx.update(watchlists)
          .set({ lastItemAddedAt: sql`CURRENT_TIMESTAMP` })
          .where(eq(watchlists.id, watchlistId))
          .run();
      }

      return { success: true, insertedCount: inserted.length };
    }

    if (!insertionPosition) {
      return { success: false, message: CUSTOM_ORDER_INSERTION_REQUIRED_MESSAGE };
    }

    const existingItems = tx
      .select({
        id: watchlistItems.id,
        tmdbId: watchlistItems.tmdbId,
        mediaType: watchlistItems.mediaType,
        releaseDate: watchlistItems.releaseDate,
        customRank: watchlistItems.customRank,
      })
      .from(watchlistItems)
      .where(eq(watchlistItems.watchlistId, watchlistId))
      .orderBy(
        sql`CASE WHEN ${watchlistItems.customRank} IS NULL THEN 1 ELSE 0 END`,
        asc(watchlistItems.customRank),
        sql`CASE WHEN ${watchlistItems.releaseDate} IS NULL OR ${watchlistItems.releaseDate} = '' THEN 1 ELSE 0 END`,
        asc(watchlistItems.releaseDate),
        asc(watchlistItems.id),
      )
      .all();

    const dedupedItems = dedupePendingItems(items, existingItems);
    if (dedupedItems.length === 0) {
      return { success: true, insertedCount: 0 };
    }

    const orderedPendingItems = orderPendingItemsByReleaseDate(dedupedItems);
    const finalOrder = buildFinalOrder({
      existingItems,
      pendingItems: orderedPendingItems,
      insertionPosition,
    });

    for (const [index, item] of finalOrder.entries()) {
      const nextRank = index + 1;

      if ("pendingIndex" in item) {
        tx.insert(watchlistItems)
          .values({
            ...item,
            customRank: nextRank,
          })
          .run();
        continue;
      }

      tx.update(watchlistItems)
        .set({ customRank: nextRank })
        .where(and(eq(watchlistItems.id, item.id), eq(watchlistItems.watchlistId, watchlistId)))
        .run();
    }

    tx.update(watchlists)
      .set({ lastItemAddedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(watchlists.id, watchlistId))
      .run();

    return { success: true, insertedCount: orderedPendingItems.length };
  });
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

function orderPendingItemsByReleaseDate(
  items: PendingWatchlistItem[],
): PendingWatchlistItemWithIndex[] {
  return items
    .map((item, pendingIndex) => ({
      ...item,
      pendingIndex,
    }))
    .sort((left, right) =>
      compareReleaseDates(
        {
          id: left.pendingIndex,
          releaseDate: left.releaseDate ?? null,
        },
        {
          id: right.pendingIndex,
          releaseDate: right.releaseDate ?? null,
        },
      ),
    );
}

function buildFinalOrder({
  existingItems,
  pendingItems,
  insertionPosition,
}: {
  existingItems: PersistedWatchlistItem[];
  pendingItems: PendingWatchlistItemWithIndex[];
  insertionPosition: AddToWatchlistInsertionPosition;
}) {
  if (insertionPosition === "beginning") {
    return [...pendingItems, ...existingItems];
  }

  if (insertionPosition === "end") {
    return [...existingItems, ...pendingItems];
  }

  const nextOrder: OrderedWatchlistItem[] = [...existingItems];

  for (const pendingItem of pendingItems) {
    const insertionIndex = getReleaseAdjacentInsertionIndex(nextOrder, pendingItem);
    nextOrder.splice(insertionIndex, 0, pendingItem);
  }

  return nextOrder;
}

function getReleaseAdjacentInsertionIndex(
  currentOrder: OrderedWatchlistItem[],
  pendingItem: PendingWatchlistItemWithIndex,
) {
  const pendingReleaseDate = normalizeReleaseDate(pendingItem.releaseDate);
  if (!pendingReleaseDate) {
    return currentOrder.length;
  }

  let lastMatchingIndex = -1;

  for (const [index, item] of currentOrder.entries()) {
    const itemReleaseDate = normalizeReleaseDate(item.releaseDate);
    if (!itemReleaseDate) {
      continue;
    }

    if (itemReleaseDate <= pendingReleaseDate) {
      lastMatchingIndex = index;
    }
  }

  return lastMatchingIndex === -1 ? 0 : lastMatchingIndex + 1;
}

function normalizeReleaseDate(releaseDate: string | null | undefined) {
  const normalized = releaseDate?.trim();
  return normalized ? normalized : null;
}

function toWatchlistItemKey(item: Pick<PersistedWatchlistItem, "tmdbId" | "mediaType">) {
  return `${item.tmdbId}::${item.mediaType}`;
}
