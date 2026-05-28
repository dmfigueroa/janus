import { getDb } from "@/db/db.server";
import { watchlistItems, watchlists } from "@/db/schema";
import { type WatchlistItemOrderMode } from "@/features/watchlists/order";
import {
  computeItemInsertionOrder,
  type InsertionPosition,
} from "@/features/watchlists/order-insert.server";
import { customRankOrder } from "@/features/watchlists/order.server";
import {
  markLastItemAddedInTransaction,
  type WatchlistTransaction,
} from "@/features/watchlists/repository.server";
import { and, asc, eq } from "drizzle-orm";
import { MoveItemError } from "@/features/watchlists/errors.server";
import { extractItemFields, type ItemInsertFields } from "@/features/watchlists/item-fields.server";

type WatchlistItemRow = typeof watchlistItems.$inferSelect;

type MoveItemResult =
  | { success: true; movedCount: number; message: string }
  | { success: false; message: string };

export async function moveItemToWatchlistMutation({
  itemId,
  destinationWatchlistId,
  position,
}: {
  itemId: number;
  destinationWatchlistId: number;
  position?: InsertionPosition;
}): Promise<MoveItemResult> {
  const db = getDb();

  let item: WatchlistItemRow;
  let destination: { id: number; name: string; itemOrderMode: WatchlistItemOrderMode };

  try {
    item = await fetchItemOrThrow(db, itemId);
    destination = await fetchWatchlistOrThrow(db, destinationWatchlistId);
    await ensureNoDuplicate(db, item, destinationWatchlistId);
  } catch (e) {
    if (e instanceof MoveItemError) {
      return { success: false, message: e.message };
    }
    throw e;
  }

  await executeMove(db, item, destination, position);

  return {
    success: true,
    movedCount: 1,
    message: `Moved ${item.title} to ${destination.name}.`,
  };
}

async function fetchItemOrThrow(
  db: ReturnType<typeof getDb>,
  itemId: number,
): Promise<WatchlistItemRow> {
  const item = await db.query.watchlistItems.findFirst({
    where: eq(watchlistItems.id, itemId),
  });
  if (!item) {
    throw new MoveItemError("Item not found.");
  }
  return item;
}

async function fetchWatchlistOrThrow(
  db: ReturnType<typeof getDb>,
  watchlistId: number,
): Promise<{ id: number; name: string; itemOrderMode: WatchlistItemOrderMode }> {
  const watchlist = await db.query.watchlists.findFirst({
    where: eq(watchlists.id, watchlistId),
  });
  if (!watchlist) {
    throw new MoveItemError("Destination watchlist not found.");
  }
  return watchlist;
}

async function ensureNoDuplicate(
  db: ReturnType<typeof getDb>,
  item: WatchlistItemRow,
  destinationWatchlistId: number,
) {
  const duplicate = await db.query.watchlistItems.findFirst({
    where: and(
      eq(watchlistItems.watchlistId, destinationWatchlistId),
      eq(watchlistItems.tmdbId, item.tmdbId),
      eq(watchlistItems.mediaType, item.mediaType),
    ),
  });
  if (duplicate) {
    throw new MoveItemError("already in destination");
  }
}

function executeMove(
  db: ReturnType<typeof getDb>,
  item: WatchlistItemRow,
  destination: { id: number; itemOrderMode: WatchlistItemOrderMode },
  position?: InsertionPosition,
) {
  return db.transaction((transaction) => {
    const insertFields = extractItemFields(item);

    transaction.delete(watchlistItems).where(eq(watchlistItems.id, item.id)).run();

    if (destination.itemOrderMode === "custom") {
      executeMoveForCustomMode(transaction, insertFields, destination.id, position ?? "end");
    } else {
      executeMoveForReleaseMode(transaction, insertFields, destination.id);
    }

    markLastItemAddedInTransaction(transaction, destination.id);
  });
}

function executeMoveForReleaseMode(
  transaction: WatchlistTransaction,
  insertFields: ItemInsertFields,
  destinationId: number,
) {
  transaction
    .insert(watchlistItems)
    .values({ watchlistId: destinationId, ...insertFields })
    .run();
}

type OrderedRankItem = {
  id?: number;
  tmdbId: string;
  mediaType: string;
  releaseDate: string | null;
  customRank: number | null;
  newRank: number;
};

function executeMoveForCustomMode(
  transaction: WatchlistTransaction,
  insertFields: ItemInsertFields,
  destinationId: number,
  position: InsertionPosition,
) {
  const existingItems = queryExistingItemsForOrdering(transaction, destinationId);

  const orderedItems = computeNewRanks(existingItems, insertFields, position);

  persistRankUpdates(transaction, orderedItems, destinationId);
  persistInsertedItem(transaction, orderedItems, destinationId, insertFields);
}

function queryExistingItemsForOrdering(transaction: WatchlistTransaction, destinationId: number) {
  return transaction
    .select({
      id: watchlistItems.id,
      tmdbId: watchlistItems.tmdbId,
      mediaType: watchlistItems.mediaType,
      releaseDate: watchlistItems.releaseDate,
      customRank: watchlistItems.customRank,
    })
    .from(watchlistItems)
    .where(eq(watchlistItems.watchlistId, destinationId))
    .orderBy(...customRankOrder, asc(watchlistItems.id))
    .all();
}

function computeNewRanks(
  existingItems: {
    id: number;
    tmdbId: string;
    mediaType: string;
    releaseDate: string | null;
    customRank: number | null;
  }[],
  insertFields: ItemInsertFields,
  position: InsertionPosition,
): OrderedRankItem[] {
  return computeItemInsertionOrder(
    existingItems,
    {
      tmdbId: insertFields.tmdbId,
      mediaType: insertFields.mediaType,
      releaseDate: insertFields.releaseDate,
      customRank: null,
    },
    position,
    "custom",
  );
}

function persistRankUpdates(
  transaction: WatchlistTransaction,
  orderedItems: OrderedRankItem[],
  destinationId: number,
) {
  for (const orderedItem of orderedItems) {
    if (orderedItem.id !== undefined && orderedItem.newRank !== orderedItem.customRank) {
      transaction
        .update(watchlistItems)
        .set({ customRank: orderedItem.newRank })
        .where(
          and(eq(watchlistItems.id, orderedItem.id), eq(watchlistItems.watchlistId, destinationId)),
        )
        .run();
    }
  }
}

function persistInsertedItem(
  transaction: WatchlistTransaction,
  orderedItems: OrderedRankItem[],
  destinationId: number,
  insertFields: ItemInsertFields,
) {
  const insertedItem = orderedItems.find((o) => o.id === undefined);
  if (insertedItem) {
    transaction
      .insert(watchlistItems)
      .values({
        watchlistId: destinationId,
        ...insertFields,
        customRank: insertedItem.newRank,
      })
      .run();
  }
}
