import { getDb } from "@/db/Db.server";
import { watchlistItems } from "@/db/Schema";
import type { InsertionPosition } from "@/features/watchlists/InsertOrderedItem.server";
import { MoveItemError } from "@/features/watchlists/Errors.server";
import { CUSTOM_ORDER_INSERTION_REQUIRED_MESSAGE } from "@/features/watchlists/add/Constants";
import type { WatchlistItemOrderMode } from "@/features/watchlists/Order";
import { type MoveDestination, type MoveItemFailureResult } from "./MoveTypes";

export function customInsertionFailure(
  itemOrderMode: WatchlistItemOrderMode,
  position: InsertionPosition | undefined,
  _referenceItemId: number | undefined,
): MoveItemFailureResult | null {
  if (isAnchorPosition(position)) {
    return anchorModeFailure(itemOrderMode);
  }
  return legacyModeFailure(itemOrderMode, position);
}

function anchorModeFailure(itemOrderMode: WatchlistItemOrderMode): MoveItemFailureResult | null {
  if (itemOrderMode !== "custom") {
    return notCustomModeFailure();
  }
  return null;
}

function legacyModeFailure(
  itemOrderMode: WatchlistItemOrderMode,
  position: InsertionPosition | undefined,
): MoveItemFailureResult | null {
  if (itemOrderMode !== "custom" || position) {
    return null;
  }
  return {
    success: false,
    code: "insertion_choice_required",
    message: CUSTOM_ORDER_INSERTION_REQUIRED_MESSAGE,
  };
}

export function isAnchorPosition(
  position: InsertionPosition | undefined,
): position is "before" | "after" {
  return position === "before" || position === "after";
}

function notCustomModeFailure(): MoveItemFailureResult {
  return {
    success: false,
    code: "not_custom_mode",
    message: "Anchored insertion is only available in custom mode.",
  };
}

export function moveItemFailure(error: MoveItemError): MoveItemFailureResult {
  return { success: false, code: error.code, message: error.message };
}

export function sameListAnchorFailure(): MoveItemFailureResult {
  return {
    success: false,
    code: "invalid_reference",
    message:
      "Cannot anchor a move within the same watchlist. Use reorder_watchlist_items for same-list reordering.",
  };
}

export function invalidReferenceFailure(referenceItemId: number): MoveItemFailureResult {
  return {
    success: false,
    code: "invalid_reference",
    message: `Reference item ${referenceItemId} is not in this watchlist.`,
  };
}

export type MoveItemLoadContext =
  | { success: true; item: typeof watchlistItems.$inferSelect; destination: MoveDestination }
  | MoveItemFailureResult;

export async function loadItemMoveContext(
  db: ReturnType<typeof getDb>,
  itemId: number,
  destinationWatchlistId: number,
): Promise<MoveItemLoadContext> {
  try {
    const item = await fetchItemOrThrow(db, itemId);
    const destination = await fetchWatchlistOrThrow(db, destinationWatchlistId);
    return { success: true, item, destination };
  } catch (error) {
    if (error instanceof MoveItemError) {
      return moveItemFailure(error);
    }
    throw error;
  }
}

export async function fetchItemOrThrow(db: ReturnType<typeof getDb>, itemId: number) {
  const item = await db.query.watchlistItems.findFirst({
    where: (table, { eq }) => eq(table.id, itemId),
  });
  if (!item) {
    throw new MoveItemError("Item not found.", "not_found");
  }
  return item;
}

export async function fetchWatchlistOrThrow(
  db: ReturnType<typeof getDb>,
  watchlistId: number,
): Promise<MoveDestination> {
  const watchlist = await db.query.watchlists.findFirst({
    where: (table, { eq }) => eq(table.id, watchlistId),
  });
  if (!watchlist) {
    throw new MoveItemError("Destination watchlist not found.", "not_found");
  }
  return watchlist;
}

export async function ensureNoDuplicate(
  db: ReturnType<typeof getDb>,
  item: typeof watchlistItems.$inferSelect,
  destinationWatchlistId: number,
) {
  const duplicate = await db.query.watchlistItems.findFirst({
    where: (table, { and, eq: drizzleEq }) =>
      and(
        drizzleEq(table.watchlistId, destinationWatchlistId),
        drizzleEq(table.tmdbId, item.tmdbId),
        drizzleEq(table.mediaType, item.mediaType),
      ),
  });
  if (duplicate) {
    throw new MoveItemError("Item already exists in the destination watchlist.", "duplicate");
  }
}

export type { MoveItemFailureCode, MoveItemFailureResult, MoveItemResult } from "./MoveTypes";
