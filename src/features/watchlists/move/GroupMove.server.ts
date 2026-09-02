import { getDb } from "@/db/Db.server";
import { watchlistItems } from "@/db/Schema";
import { type InsertionPosition } from "@/features/watchlists/InsertOrderedItem.server";
import { MoveItemError } from "@/features/watchlists/Errors.server";
import { executeGroupMove } from "./MoveItems.server";
import {
  ensureNoDuplicate,
  moveItemFailure,
  type MoveDestination,
  type MoveItemFailureResult,
  type MoveItemResult,
} from "./Mutation.server";

type WatchlistItemRow = typeof watchlistItems.$inferSelect;

export async function moveParentGroupToWatchlist(
  db: ReturnType<typeof getDb>,
  groupItems: WatchlistItemRow[],
  destination: MoveDestination,
  destinationWatchlistId: number,
  position: InsertionPosition | undefined,
): Promise<MoveItemResult> {
  const duplicateFailure = await getGroupDuplicateFailure(db, groupItems, destinationWatchlistId);
  if (duplicateFailure) {
    return duplicateFailure;
  }

  await executeGroupMove(db, groupItems, destination, position);

  return {
    success: true,
    movedCount: groupItems.length,
    message: `Moved ${groupMoveLabel(groupItems)} to ${destination.name}.`,
  };
}

export async function getGroupDuplicateFailure(
  db: ReturnType<typeof getDb>,
  items: WatchlistItemRow[],
  destinationWatchlistId: number,
): Promise<MoveItemFailureResult | null> {
  try {
    await ensureNoDuplicatesForGroup(db, items, destinationWatchlistId);
    return null;
  } catch (error) {
    if (error instanceof MoveItemError) {
      return moveItemFailure(error);
    }
    throw error;
  }
}

async function ensureNoDuplicatesForGroup(
  db: ReturnType<typeof getDb>,
  items: WatchlistItemRow[],
  destinationWatchlistId: number,
) {
  for (const item of items) {
    await ensureNoDuplicate(db, item, destinationWatchlistId);
  }
}

function groupMoveLabel(groupItems: WatchlistItemRow[]) {
  return groupItems.length > 1 ? `${groupItems.length} items` : groupItems[0]!.title;
}
