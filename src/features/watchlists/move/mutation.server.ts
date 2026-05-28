import { getDb } from "@/db/db.server";
import { watchlistItems, watchlists } from "@/db/schema";
import { type WatchlistItemOrderMode } from "@/features/watchlists/order";
import {
  insertItemWithCustomOrder,
  type InsertionPosition,
  type ItemInsertFields,
} from "@/features/watchlists/insert-ordered-item.server";
import {
  markLastItemAddedInTransaction,
  type WatchlistTransaction,
} from "@/features/watchlists/repository.server";
import { and, eq } from "drizzle-orm";
import { MoveItemError } from "@/features/watchlists/errors.server";

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
    const insertFields: ItemInsertFields = {
      tmdbId: item.tmdbId,
      source: item.source,
      mediaType: item.mediaType,
      title: item.title,
      parentId: item.parentId,
      parentTitle: item.parentTitle,
      season: item.season,
      episode: item.episode,
      posterPath: item.posterPath,
      releaseDate: item.releaseDate,
      voteAverage: item.voteAverage,
      runtime: item.runtime,
      isWatched: item.isWatched,
      authors: item.authors,
      addedAt: item.addedAt,
    };

    deleteItemFromSource(transaction, item.id);
    insertItemIntoDestination(transaction, insertFields, destination, position);
    markLastItemAddedInTransaction(transaction, destination.id);
  });
}

function deleteItemFromSource(transaction: WatchlistTransaction, itemId: number) {
  transaction.delete(watchlistItems).where(eq(watchlistItems.id, itemId)).run();
}

function insertItemIntoDestination(
  transaction: WatchlistTransaction,
  insertFields: ItemInsertFields,
  destination: { id: number; itemOrderMode: WatchlistItemOrderMode },
  position?: InsertionPosition,
) {
  if (destination.itemOrderMode === "custom") {
    insertItemWithCustomOrder(transaction, insertFields, destination.id, position ?? "end");
  } else {
    insertItemForReleaseMode(transaction, insertFields, destination.id);
  }
}

function insertItemForReleaseMode(
  transaction: WatchlistTransaction,
  insertFields: ItemInsertFields,
  destinationId: number,
) {
  transaction
    .insert(watchlistItems)
    .values({ watchlistId: destinationId, ...insertFields })
    .run();
}
