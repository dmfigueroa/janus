import { getDb } from "@/db/Db.server";
import type { watchlistItems } from "@/db/Schema";
import {
  InsertItemReferenceError,
  type InsertionPosition,
} from "@/features/watchlists/InsertOrderedItem.server";
import { MoveItemError } from "@/features/watchlists/Errors.server";
import { executeMove } from "./MoveItems.server";
import {
  customInsertionFailure,
  ensureNoDuplicate,
  invalidReferenceFailure,
  isAnchorPosition,
  loadItemMoveContext,
  moveItemFailure,
  sameListAnchorFailure,
} from "./MoveFailure.server";
import type { MoveDestination, MoveItemFailureResult, MoveItemResult } from "./MoveTypes";

export async function moveItemToWatchlistMutation(input: {
  itemId: number;
  destinationWatchlistId: number;
  position?: InsertionPosition;
  referenceItemId?: number;
}): Promise<MoveItemResult> {
  const db = getDb();
  const context = await loadItemMoveContext(db, input.itemId, input.destinationWatchlistId);
  if (!context.success) {
    return context;
  }

  const gated = await gateMove(db, context, input);
  if (gated) return gated;

  return executeMoveOrFail(db, context, input);
}

async function executeMoveOrFail(
  db: ReturnType<typeof getDb>,
  context: { item: typeof watchlistItems.$inferSelect; destination: MoveDestination },
  input: { position?: InsertionPosition; referenceItemId?: number },
): Promise<MoveItemResult> {
  const failure = await runMove(db, context, input);
  if (failure) return failure;
  return {
    success: true,
    movedCount: 1,
    message: `Moved ${context.item.title} to ${context.destination.name}.`,
  };
}

async function gateMove(
  db: ReturnType<typeof getDb>,
  context: { item: typeof watchlistItems.$inferSelect; destination: MoveDestination },
  input: {
    destinationWatchlistId: number;
    position?: InsertionPosition;
    referenceItemId?: number;
  },
): Promise<MoveItemFailureResult | null> {
  const sameList = preflightMove(context, input.position, input.destinationWatchlistId);
  if (sameList) return sameList;

  const duplicateFailure = await runDuplicateCheck(db, context.item, input.destinationWatchlistId);
  if (duplicateFailure) return duplicateFailure;

  return customInsertionFailure(
    context.destination.itemOrderMode,
    input.position,
    input.referenceItemId,
  );
}

function preflightMove(
  context: { item: typeof watchlistItems.$inferSelect; destination: MoveDestination },
  position: InsertionPosition | undefined,
  destinationWatchlistId: number,
): MoveItemFailureResult | null {
  if (isAnchorPosition(position) && context.item.watchlistId === destinationWatchlistId) {
    return sameListAnchorFailure();
  }
  return null;
}

async function runDuplicateCheck(
  db: ReturnType<typeof getDb>,
  item: typeof watchlistItems.$inferSelect,
  destinationWatchlistId: number,
): Promise<MoveItemFailureResult | null> {
  try {
    await ensureNoDuplicate(db, item, destinationWatchlistId);
    return null;
  } catch (error) {
    if (error instanceof MoveItemError) {
      return moveItemFailure(error);
    }
    throw error;
  }
}

async function runMove(
  db: ReturnType<typeof getDb>,
  context: { item: typeof watchlistItems.$inferSelect; destination: MoveDestination },
  input: {
    position?: InsertionPosition;
    referenceItemId?: number;
  },
): Promise<MoveItemFailureResult | null> {
  try {
    await executeMove(db, context.item, context.destination, input.position, input.referenceItemId);
    return null;
  } catch (error) {
    if (error instanceof InsertItemReferenceError) {
      return invalidReferenceFailure(error.referenceItemId);
    }
    throw error;
  }
}

// Re-export types and helpers used by sibling modules.
export {
  customInsertionFailure,
  fetchWatchlistOrThrow,
  isAnchorPosition,
  loadItemMoveContext,
  moveItemFailure,
} from "./MoveFailure.server";
export type {
  MoveItemFailureCode,
  MoveItemFailureResult,
  MoveItemResult,
  MoveDestination,
} from "./MoveTypes";

// Local helper re-exports kept for backwards compatibility with tests.
export { ensureNoDuplicate } from "./MoveFailure.server";
