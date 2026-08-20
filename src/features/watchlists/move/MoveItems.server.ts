import type { DatabaseTransaction } from "@/db/Db.server";
import { getDb } from "@/db/Db.server";
import { watchlistItems } from "@/db/Schema";
import {
  insertItemWithCustomOrder,
  type InsertionPosition,
  type ItemInsertFields,
} from "@/features/watchlists/InsertOrderedItem.server";
import type { WatchlistItemOrderMode } from "@/features/watchlists/Order";
import { markLastItemAddedInTransaction } from "@/features/watchlists/Repository.server";
import { eq } from "drizzle-orm";

type WatchlistItemRow = typeof watchlistItems.$inferSelect;

type MoveDestination = {
  id: number;
  itemOrderMode: WatchlistItemOrderMode;
};

function itemAsInsertFields(item: WatchlistItemRow): ItemInsertFields {
  return {
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
}

function deleteItemFromSource(transaction: DatabaseTransaction, itemId: number) {
  transaction.delete(watchlistItems).where(eq(watchlistItems.id, itemId)).run();
}

function insertItemIntoDestination(
  transaction: DatabaseTransaction,
  insertFields: ItemInsertFields,
  destination: MoveDestination,
  position?: InsertionPosition,
) {
  if (destination.itemOrderMode === "custom") {
    insertItemWithCustomOrder(transaction, insertFields, destination.id, position ?? "end");
  } else {
    transaction
      .insert(watchlistItems)
      .values({ watchlistId: destination.id, ...insertFields })
      .run();
  }
}

export function executeMove(
  db: ReturnType<typeof getDb>,
  item: WatchlistItemRow,
  destination: MoveDestination,
  position?: InsertionPosition,
) {
  return db.transaction((transaction) => {
    deleteItemFromSource(transaction, item.id);
    insertItemIntoDestination(transaction, itemAsInsertFields(item), destination, position);
    markLastItemAddedInTransaction(transaction, destination.id);
  });
}

export function executeGroupMove(
  db: ReturnType<typeof getDb>,
  items: WatchlistItemRow[],
  destination: MoveDestination,
  position?: InsertionPosition,
) {
  return db.transaction((transaction) => {
    for (const item of items) {
      deleteItemFromSource(transaction, item.id);
      insertItemIntoDestination(transaction, itemAsInsertFields(item), destination, position);
    }

    markLastItemAddedInTransaction(transaction, destination.id);
  });
}
