import { getDb } from "@/db/Db.server";
import { watchlistItems } from "@/db/Schema";
import { and, eq } from "drizzle-orm";
import type { InsertionPosition } from "@/features/watchlists/InsertOrderedItem.server";
import { MoveItemError } from "@/features/watchlists/Errors.server";
import {
  customInsertionFailure,
  fetchWatchlistOrThrow,
  moveItemFailure,
  type MoveDestination,
  type MoveItemFailureResult,
} from "./Mutation.server";

type WatchlistItemRow = typeof watchlistItems.$inferSelect;

export async function loadMoveContext(
  db: ReturnType<typeof getDb>,
  itemId: number,
  destinationWatchlistId: number,
) {
  try {
    const item = await findItemOrThrow(db, itemId);
    const destination = await fetchWatchlistOrThrow(db, destinationWatchlistId);
    return { success: true as const, item, destination };
  } catch (error) {
    return moveLoadFailure(error);
  }
}

export async function loadGroupDestination(
  db: ReturnType<typeof getDb>,
  destinationWatchlistId: number,
  position: InsertionPosition | undefined,
  referenceItemId: number | undefined,
) {
  try {
    const destination = await fetchWatchlistOrThrow(db, destinationWatchlistId);
    const insertionFailure = customInsertionFailure(
      destination.itemOrderMode,
      position,
      referenceItemId,
    );
    if (insertionFailure) {
      return insertionFailure;
    }
    return { success: true as const, destination };
  } catch (error) {
    return moveLoadFailure(error);
  }
}

export async function findItemOrThrow(db: ReturnType<typeof getDb>, itemId: number) {
  const item = await db.query.watchlistItems.findFirst({
    where: eq(watchlistItems.id, itemId),
  });
  if (!item) {
    throw new MoveItemError("Item not found.", "not_found");
  }
  return item;
}

export function findParentGroupItems(
  db: ReturnType<typeof getDb>,
  watchlistId: number,
  parentId: string,
) {
  return db.query.watchlistItems.findMany({
    where: and(eq(watchlistItems.watchlistId, watchlistId), eq(watchlistItems.parentId, parentId)),
  });
}

export function moveLoadFailure(error: unknown): MoveItemFailureResult {
  if (error instanceof MoveItemError) {
    return moveItemFailure(error);
  }
  throw error;
}

export function parentSelectionFailure(
  item: WatchlistItemRow,
  destination: MoveDestination,
  position: InsertionPosition | undefined,
  referenceItemId: number | undefined,
): MoveItemFailureResult | null {
  if (!item.parentId) {
    return { success: false, code: "no_parent_group", message: "Item has no parent group." };
  }
  return customInsertionFailure(destination.itemOrderMode, position, referenceItemId);
}
