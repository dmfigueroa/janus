import { getDb } from "@/db/Db.server";
import type { InsertionPosition, WatchlistItemOrderMode } from "@/features/watchlists/Order";
import { MoveItemError, type MoveItemFailureCode } from "@/features/watchlists/Errors.server";
import { InsertItemReferenceError } from "@/features/watchlists/InsertOrderedItem.server";
import { executeMove, executeGroupMove } from "./PersistMovement.server";
import {
  customInsertionFailure,
  ensureNoDuplicate,
  invalidReferenceFailure,
  isAnchorPosition,
  loadItemMoveContext,
  loadGroupDestination,
  findParentGroupItems,
  moveItemFailure,
  parentSelectionFailure,
  sameListAnchorFailure,
} from "./MovementSelection.server";

export type MoveItemFailureResult = { success: false; code: MoveItemFailureCode; message: string };
export type MoveItemResult =
  | { success: true; movedCount: number; message: string }
  | MoveItemFailureResult;
export type MoveDestination = { id: number; name: string; itemOrderMode: WatchlistItemOrderMode };
type MoveInput = {
  destinationWatchlistId: number;
  position?: InsertionPosition;
  referenceItemId?: number;
};
type ItemMoveInput = MoveInput & { itemId: number };
type SelectedItem = Extract<
  Awaited<ReturnType<typeof loadItemMoveContext>>,
  { success: true }
>["item"];

export async function moveItemToWatchlistMutation(input: ItemMoveInput): Promise<MoveItemResult> {
  const context = await loadItemMoveContext(getDb(), input.itemId, input.destinationWatchlistId);
  if (!context.success) return context;
  const { item, destination } = context;
  const failure = await validateSingleMove(item, destination, input);
  if (failure) return failure;
  return persistMovement([item], destination, input, false);
}

export async function moveParentAndChildrenToWatchlistMutation(
  input: ItemMoveInput,
): Promise<MoveItemResult> {
  const context = await loadItemMoveContext(getDb(), input.itemId, input.destinationWatchlistId);
  if (!context.success) return context;
  const { item, destination } = context;
  const failure = parentSelectionFailure(item, destination, input.position, input.referenceItemId);
  if (failure) return failure;
  const items = await findParentGroupItems(getDb(), item.watchlistId, item.parentId!, true);
  return moveSelectedGroup(items, destination, input);
}

export async function moveParentToWatchlistMutation(
  input: MoveInput & { watchlistId: number; parentId: string },
): Promise<MoveItemResult> {
  const items = await findParentGroupItems(getDb(), input.watchlistId, input.parentId);
  if (items.length === 0) {
    return { success: false, code: "not_found", message: "Parent not found in this watchlist." };
  }
  const context = await loadGroupDestination(
    getDb(),
    input.destinationWatchlistId,
    input.position,
    input.referenceItemId,
  );
  if (!context.success) return context;
  return moveSelectedGroup(items, context.destination, input);
}

async function moveSelectedGroup(
  items: SelectedItem[],
  destination: MoveDestination,
  input: MoveInput,
): Promise<MoveItemResult> {
  const failure = await checkDuplicates(items, destination.id);
  if (failure) return failure;
  return persistMovement(items, destination, input, true);
}

async function checkDuplicates(
  items: SelectedItem[],
  destinationId: number,
): Promise<MoveItemFailureResult | null> {
  try {
    // Sequential checks preserve selection order and the first expected failure.
    for (const item of items) await ensureNoDuplicate(getDb(), item, destinationId);
    return null;
  } catch (error) {
    return translateDuplicateFailure(error);
  }
}

function persistMovement(
  items: SelectedItem[],
  destination: MoveDestination,
  input: MoveInput,
  grouped: boolean,
): MoveItemResult {
  try {
    if (grouped) {
      executeGroupMove(getDb(), items, destination, input.position, input.referenceItemId);
    } else {
      executeMove(getDb(), items[0]!, destination, input.position, input.referenceItemId);
    }
    const label = movementLabel(items);
    return {
      success: true,
      movedCount: items.length,
      message: `Moved ${label} to ${destination.name}.`,
    };
  } catch (error) {
    return translateInsertionFailure(error);
  }
}

async function validateSingleMove(
  item: SelectedItem,
  destination: MoveDestination,
  input: MoveInput,
) {
  const sameListFailure = validateSameList(item, destination, input);
  if (sameListFailure) return sameListFailure;
  const duplicateFailure = await checkDuplicates([item], destination.id);
  return (
    duplicateFailure ??
    customInsertionFailure(destination.itemOrderMode, input.position, input.referenceItemId)
  );
}

function validateSameList(item: SelectedItem, destination: MoveDestination, input: MoveInput) {
  if (isAnchorPosition(input.position) && item.watchlistId === destination.id)
    return sameListAnchorFailure();
  return null;
}

function translateDuplicateFailure(error: unknown): MoveItemFailureResult {
  if (error instanceof MoveItemError) return moveItemFailure(error);
  throw error;
}

function translateInsertionFailure(error: unknown): MoveItemFailureResult {
  if (error instanceof InsertItemReferenceError)
    return invalidReferenceFailure(error.referenceItemId);
  throw error;
}

function movementLabel(items: SelectedItem[]) {
  return items.length > 1 ? `${items.length} items` : items[0]!.title;
}
