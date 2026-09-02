import { getDb } from "@/db/Db.server";
import { watchlistItems, watchlists } from "@/db/Schema";
import { type WatchlistItemOrderMode } from "@/features/watchlists/Order";
import { type InsertionPosition } from "@/features/watchlists/InsertOrderedItem.server";
import { and, eq } from "drizzle-orm";
import { MoveItemError, type MoveItemFailureCode } from "@/features/watchlists/Errors.server";
import { CUSTOM_ORDER_INSERTION_REQUIRED_MESSAGE } from "@/features/watchlists/add/Constants";
import { executeMove } from "./MoveItems.server";

type WatchlistItemRow = typeof watchlistItems.$inferSelect;

export type MoveItemFailureResult = {
  success: false;
  code: MoveItemFailureCode;
  message: string;
};

export type MoveItemResult =
  | { success: true; movedCount: number; message: string }
  | MoveItemFailureResult;

export type MoveDestination = {
  id: number;
  name: string;
  itemOrderMode: WatchlistItemOrderMode;
};

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

  const context = await loadItemMoveContext(db, itemId, destinationWatchlistId);
  if (!context.success) {
    return context;
  }

  const insertionFailure = customInsertionFailure(context.destination.itemOrderMode, position);
  if (insertionFailure) {
    return insertionFailure;
  }

  await executeMove(db, context.item, context.destination, position);

  return {
    success: true,
    movedCount: 1,
    message: `Moved ${context.item.title} to ${context.destination.name}.`,
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
    throw new MoveItemError("Item not found.", "not_found");
  }
  return item;
}

export async function fetchWatchlistOrThrow(
  db: ReturnType<typeof getDb>,
  watchlistId: number,
): Promise<MoveDestination> {
  const watchlist = await db.query.watchlists.findFirst({
    where: eq(watchlists.id, watchlistId),
  });
  if (!watchlist) {
    throw new MoveItemError("Destination watchlist not found.", "not_found");
  }
  return watchlist;
}

export async function ensureNoDuplicate(
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
    throw new MoveItemError("Item already exists in the destination watchlist.", "duplicate");
  }
}

async function loadItemMoveContext(
  db: ReturnType<typeof getDb>,
  itemId: number,
  destinationWatchlistId: number,
) {
  try {
    const item = await fetchItemOrThrow(db, itemId);
    const destination = await fetchWatchlistOrThrow(db, destinationWatchlistId);
    await ensureNoDuplicate(db, item, destinationWatchlistId);
    return { success: true as const, item, destination };
  } catch (error) {
    if (error instanceof MoveItemError) {
      return moveItemFailure(error);
    }
    throw error;
  }
}

export function customInsertionFailure(
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

export function moveItemFailure(error: MoveItemError): MoveItemFailureResult {
  return { success: false, code: error.code, message: error.message };
}
