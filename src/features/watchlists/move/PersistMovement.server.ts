import { getDb, type DatabaseTransaction } from "@/db/Db.server";
import { watchlistItems } from "@/db/Schema";
import { eq } from "drizzle-orm";
import {
  insertItemWithCustomOrder,
  type InsertionPosition,
  type ItemInsertFields,
} from "@/features/watchlists/InsertOrderedItem.server";
import { markLastItemAddedInTransaction } from "@/features/watchlists/Repository.server";
import {
  applyAnchoredGroupInsertion,
  type GroupItemInsertFields,
} from "./AnchoredGroupInsertion.server";
import type { WatchlistItemOrderMode } from "@/features/watchlists/Order";
type MoveDestination = { id: number; itemOrderMode: WatchlistItemOrderMode };
type WatchlistItemRow = typeof watchlistItems.$inferSelect;

export function executeMove(
  db: ReturnType<typeof getDb>,
  item: WatchlistItemRow,
  destination: MoveDestination,
  position?: InsertionPosition,
  referenceItemId?: number,
) {
  return db.transaction((transaction) => {
    deleteItemFromSource(transaction, item.id);
    insertItemIntoDestination(
      transaction,
      itemAsInsertFields(item),
      destination,
      position,
      referenceItemId,
    );
    markLastItemAddedInTransaction(transaction, destination.id);
  });
}

export function executeGroupMove(
  db: ReturnType<typeof getDb>,
  items: WatchlistItemRow[],
  destination: MoveDestination,
  position?: InsertionPosition,
  referenceItemId?: number,
) {
  if (destination.itemOrderMode !== "custom") {
    return moveGroupByAppend(db, items, destination);
  }
  return moveGroupWithAnchor(db, items, destination, position, referenceItemId);
}

function moveGroupByAppend(
  db: ReturnType<typeof getDb>,
  items: WatchlistItemRow[],
  destination: MoveDestination,
) {
  return db.transaction((transaction) => {
    for (const item of items) {
      deleteItemFromSource(transaction, item.id);
      insertItemIntoDestination(transaction, itemAsInsertFields(item), destination);
    }
    markLastItemAddedInTransaction(transaction, destination.id);
  });
}

function moveGroupWithAnchor(
  db: ReturnType<typeof getDb>,
  items: WatchlistItemRow[],
  destination: MoveDestination,
  position: InsertionPosition | undefined,
  referenceItemId: number | undefined,
) {
  return db.transaction((transaction) => {
    for (const item of items) {
      deleteItemFromSource(transaction, item.id);
    }
    applyAnchoredGroupInsertion(
      transaction,
      items,
      { id: destination.id },
      position,
      referenceItemId,
      itemAsInsertFields,
    );
    markLastItemAddedInTransaction(transaction, destination.id);
  });
}

function deleteItemFromSource(transaction: DatabaseTransaction, itemId: number) {
  transaction.delete(watchlistItems).where(eq(watchlistItems.id, itemId)).run();
}

function insertItemIntoDestination(
  transaction: DatabaseTransaction,
  insertFields: ItemInsertFields,
  destination: MoveDestination,
  position?: InsertionPosition,
  referenceItemId?: number,
) {
  if (destination.itemOrderMode !== "custom") {
    insertAtEnd(transaction, insertFields, destination.id);
    return;
  }
  insertItemWithCustomOrder(
    transaction,
    insertFields,
    destination.id,
    position ?? "end",
    referenceItemId,
  );
}

function insertAtEnd(
  transaction: DatabaseTransaction,
  insertFields: ItemInsertFields,
  destinationId: number,
) {
  transaction
    .insert(watchlistItems)
    .values({ watchlistId: destinationId, ...insertFields })
    .run();
}

function itemAsInsertFields(item: WatchlistItemRow): GroupItemInsertFields {
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
    isWatched: Boolean(item.isWatched),
    authors: item.authors,
    addedAt: item.addedAt,
  };
}
