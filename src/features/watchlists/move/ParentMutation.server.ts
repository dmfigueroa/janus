import { getDb } from "@/db/Db.server";
import { watchlistItems } from "@/db/Schema";
import { and, eq } from "drizzle-orm";
import { type InsertionPosition } from "@/features/watchlists/InsertOrderedItem.server";
import { MoveItemError } from "@/features/watchlists/Errors.server";
import { moveParentGroupToWatchlist } from "./GroupMove.server";
import {
  customInsertionFailure,
  fetchWatchlistOrThrow,
  moveItemFailure,
  type MoveDestination,
  type MoveItemFailureResult,
  type MoveItemResult,
} from "./Mutation.server";

type WatchlistItemRow = typeof watchlistItems.$inferSelect;

export async function moveParentAndChildrenToWatchlistMutation({
  itemId,
  destinationWatchlistId,
  position,
}: {
  itemId: number;
  destinationWatchlistId: number;
  position?: InsertionPosition;
}): Promise<MoveItemResult> {
  const db = getDb();
  const context = await loadMoveContext(db, itemId, destinationWatchlistId);
  if (!context.success) {
    return context;
  }
  const { item, destination } = context;

  const selectionFailure = parentSelectionFailure(item, destination, position);
  if (selectionFailure) {
    return selectionFailure;
  }

  const parentId = item.parentId!;
  const siblings = await db.query.watchlistItems.findMany({
    where: and(
      eq(watchlistItems.watchlistId, item.watchlistId),
      eq(watchlistItems.parentId, parentId),
    ),
  });

  return moveParentGroupToWatchlist(db, siblings, destination, destinationWatchlistId, position);
}

export async function moveParentToWatchlistMutation({
  watchlistId,
  parentId,
  destinationWatchlistId,
  position,
}: {
  watchlistId: number;
  parentId: string;
  destinationWatchlistId: number;
  position?: InsertionPosition;
}): Promise<MoveItemResult> {
  const db = getDb();

  const context = await loadParentMoveContext(db, {
    watchlistId,
    parentId,
    destinationWatchlistId,
    position,
  });
  if (!context.success) {
    return context;
  }
  const { groupItems, destination } = context;

  return moveParentGroupToWatchlist(db, groupItems, destination, destinationWatchlistId, position);
}

async function loadMoveContext(
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

async function loadParentMoveContext(
  db: ReturnType<typeof getDb>,
  {
    watchlistId,
    parentId,
    destinationWatchlistId,
    position,
  }: {
    watchlistId: number;
    parentId: string;
    destinationWatchlistId: number;
    position?: InsertionPosition;
  },
) {
  const groupItems = await findParentGroupItems(db, watchlistId, parentId);
  if (groupItems.length === 0) {
    return {
      success: false as const,
      code: "not_found" as const,
      message: "Parent not found in this watchlist.",
    };
  }

  const destinationResult = await loadGroupDestination(db, destinationWatchlistId, position);
  if (!destinationResult.success) {
    return destinationResult;
  }

  return { success: true as const, groupItems, destination: destinationResult.destination };
}

async function loadGroupDestination(
  db: ReturnType<typeof getDb>,
  destinationWatchlistId: number,
  position: InsertionPosition | undefined,
) {
  try {
    const destination = await fetchWatchlistOrThrow(db, destinationWatchlistId);
    const insertionFailure = customInsertionFailure(destination.itemOrderMode, position);
    if (insertionFailure) {
      return insertionFailure;
    }
    return { success: true as const, destination };
  } catch (error) {
    return moveLoadFailure(error);
  }
}

async function findItemOrThrow(db: ReturnType<typeof getDb>, itemId: number) {
  const item = await db.query.watchlistItems.findFirst({
    where: eq(watchlistItems.id, itemId),
  });
  if (!item) {
    throw new MoveItemError("Item not found.", "not_found");
  }
  return item;
}

function findParentGroupItems(db: ReturnType<typeof getDb>, watchlistId: number, parentId: string) {
  return db.query.watchlistItems.findMany({
    where: and(eq(watchlistItems.watchlistId, watchlistId), eq(watchlistItems.parentId, parentId)),
  });
}

function moveLoadFailure(error: unknown): MoveItemFailureResult {
  if (error instanceof MoveItemError) {
    return moveItemFailure(error);
  }
  throw error;
}

function parentSelectionFailure(
  item: WatchlistItemRow,
  destination: MoveDestination,
  position: InsertionPosition | undefined,
): MoveItemFailureResult | null {
  if (!item.parentId) {
    return { success: false, code: "no_parent_group", message: "Item has no parent group." };
  }

  return customInsertionFailure(destination.itemOrderMode, position);
}
