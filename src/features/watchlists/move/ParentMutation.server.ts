import { getDb } from "@/db/Db.server";
import { watchlistItems } from "@/db/Schema";
import { and, eq } from "drizzle-orm";
import {
  InsertItemReferenceError,
  type InsertionPosition,
} from "@/features/watchlists/InsertOrderedItem.server";
import { moveParentGroupToWatchlist } from "./GroupMove.server";
import type { MoveDestination, MoveItemFailureResult, MoveItemResult } from "./Mutation.server";
import {
  findParentGroupItems,
  loadGroupDestination,
  loadMoveContext,
  parentSelectionFailure,
} from "./ParentMutationHelpers.server";

type WatchlistItemRow = typeof watchlistItems.$inferSelect;

export async function moveParentAndChildrenToWatchlistMutation({
  itemId,
  destinationWatchlistId,
  position,
  referenceItemId,
}: {
  itemId: number;
  destinationWatchlistId: number;
  position?: InsertionPosition;
  referenceItemId?: number;
}): Promise<MoveItemResult> {
  const db = getDb();
  const context = await loadMoveContext(db, itemId, destinationWatchlistId);
  if (!context.success) {
    return context;
  }
  const { item, destination } = context;

  const selectionFailure = parentSelectionFailure(item, destination, position, referenceItemId);
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

  return invokeGroupMove(siblings, destination, destinationWatchlistId, position, referenceItemId);
}

export async function moveParentToWatchlistMutation({
  watchlistId,
  parentId,
  destinationWatchlistId,
  position,
  referenceItemId,
}: {
  watchlistId: number;
  parentId: string;
  destinationWatchlistId: number;
  position?: InsertionPosition;
  referenceItemId?: number;
}): Promise<MoveItemResult> {
  const db = getDb();
  const context = await loadParentMoveContext(db, {
    watchlistId,
    parentId,
    destinationWatchlistId,
    position,
    referenceItemId,
  });
  if (!context.success) {
    return context;
  }
  const { groupItems, destination } = context;

  return invokeGroupMove(
    groupItems,
    destination,
    destinationWatchlistId,
    position,
    referenceItemId,
  );
}

async function invokeGroupMove(
  groupItems: WatchlistItemRow[],
  destination: MoveDestination,
  destinationWatchlistId: number,
  position: InsertionPosition | undefined,
  referenceItemId: number | undefined,
): Promise<MoveItemResult> {
  try {
    return await moveParentGroupToWatchlist(
      getDb(),
      groupItems,
      destination,
      destinationWatchlistId,
      position,
      referenceItemId,
    );
  } catch (error) {
    if (error instanceof InsertItemReferenceError) {
      return invalidReferenceFailure(error.referenceItemId);
    }
    throw error;
  }
}

function invalidReferenceFailure(referenceItemId: number): MoveItemFailureResult {
  return {
    success: false,
    code: "invalid_reference",
    message: `Reference item ${referenceItemId} is not in this watchlist.`,
  };
}

async function loadParentMoveContext(
  db: ReturnType<typeof getDb>,
  {
    watchlistId,
    parentId,
    destinationWatchlistId,
    position,
    referenceItemId,
  }: {
    watchlistId: number;
    parentId: string;
    destinationWatchlistId: number;
    position?: InsertionPosition;
    referenceItemId?: number;
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

  const destinationResult = await loadGroupDestination(
    db,
    destinationWatchlistId,
    position,
    referenceItemId,
  );
  if (!destinationResult.success) {
    return destinationResult;
  }

  return { success: true as const, groupItems, destination: destinationResult.destination };
}
