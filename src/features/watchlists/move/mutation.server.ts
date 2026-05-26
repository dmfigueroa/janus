import { getDb } from "@/db/db.server";
import { watchlistItems, watchlists } from "@/db/schema";
import {
  computeItemInsertionOrder,
  type InsertionPosition,
} from "@/features/watchlists/order-insert.server";
import { and, asc, eq, sql } from "drizzle-orm";

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
  let destination: { id: number; name: string; itemOrderMode: "release" | "custom" };

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

type WatchlistItemRow = typeof watchlistItems.$inferSelect;

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
): Promise<{ id: number; name: string; itemOrderMode: "release" | "custom" }> {
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
    throw new MoveItemError(`already in destination`);
  }
}

function executeMove(
  db: ReturnType<typeof getDb>,
  item: WatchlistItemRow,
  destination: { id: number; itemOrderMode: "release" | "custom" },
  position?: InsertionPosition,
) {
  return db.transaction((transaction) => {
    const insertFields = itemFieldsForInsert(item, destination.itemOrderMode);

    transaction.delete(watchlistItems).where(eq(watchlistItems.id, item.id)).run();

    if (destination.itemOrderMode === "custom" && position) {
      const existingItems = transaction
        .select({
          id: watchlistItems.id,
          tmdbId: watchlistItems.tmdbId,
          mediaType: watchlistItems.mediaType,
          releaseDate: watchlistItems.releaseDate,
          customRank: watchlistItems.customRank,
        })
        .from(watchlistItems)
        .where(eq(watchlistItems.watchlistId, destination.id))
        .orderBy(
          sql`CASE WHEN ${watchlistItems.customRank} IS NULL THEN 1 ELSE 0 END`,
          asc(watchlistItems.customRank),
          sql`CASE WHEN ${watchlistItems.releaseDate} IS NULL OR ${watchlistItems.releaseDate} = '' THEN 1 ELSE 0 END`,
          asc(watchlistItems.releaseDate),
          asc(watchlistItems.id),
        )
        .all();

      const orderedItems = computeItemInsertionOrder(
        existingItems,
        {
          tmdbId: insertFields.tmdbId,
          mediaType: insertFields.mediaType,
          releaseDate: insertFields.releaseDate,
          customRank: null,
        },
        position,
        destination.itemOrderMode,
      );

      for (const orderedItem of orderedItems) {
        if (orderedItem.id !== undefined) {
          transaction
            .update(watchlistItems)
            .set({ customRank: orderedItem.newRank })
            .where(
              and(
                eq(watchlistItems.id, orderedItem.id),
                eq(watchlistItems.watchlistId, destination.id),
              ),
            )
            .run();
        }
      }

      const insertedItem = orderedItems.find((o) => o.id === undefined);
      if (insertedItem) {
        transaction
          .insert(watchlistItems)
          .values({
            watchlistId: destination.id,
            ...insertFields,
            customRank: insertedItem.newRank,
          })
          .run();
      }
    } else {
      transaction
        .insert(watchlistItems)
        .values({ watchlistId: destination.id, ...insertFields })
        .run();
    }

    transaction
      .update(watchlists)
      .set({ lastItemAddedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(watchlists.id, destination.id))
      .run();
  });
}

function itemFieldsForInsert(item: WatchlistItemRow, itemOrderMode: "release" | "custom") {
  const { id: _id, watchlistId: _watchlistId, customRank: _customRank, ...rest } = item;
  void _id;
  void _watchlistId;
  void _customRank;

  if (itemOrderMode === "release") {
    return { ...rest, customRank: null };
  }

  return rest;
}

class MoveItemError {
  constructor(public message: string) {}
}
