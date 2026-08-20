import { getDb } from "@/db/Db.server";
import { watchlistItems, watchlists } from "@/db/Schema";
import { type WatchlistItemOrderMode } from "@/features/watchlists/Order";
import { type InsertionPosition } from "@/features/watchlists/InsertOrderedItem.server";
import { and, eq } from "drizzle-orm";
import { MoveItemError } from "@/features/watchlists/Errors.server";
import { executeGroupMove, executeMove } from "./MoveItems.server";

type WatchlistItemRow = typeof watchlistItems.$inferSelect;

type MoveItemResult =
  | { success: true; movedCount: number; message: string }
  | { success: false; message: string };

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

  let item: WatchlistItemRow;
  let destination: { id: number; name: string; itemOrderMode: WatchlistItemOrderMode };

  try {
    item = await fetchItemOrThrow(db, itemId);
    destination = await fetchWatchlistOrThrow(db, destinationWatchlistId);
    await ensureNoDuplicate(db, item, destinationWatchlistId);
  } catch (e) {
    if (e instanceof MoveItemError) {
      return { success: false, message: e.message };
    }
    throw e;
  }

  await executeMove(db, item, destination, position);

  return {
    success: true,
    movedCount: 1,
    message: `Moved ${item.title} to ${destination.name}.`,
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
    throw new MoveItemError("Item not found.");
  }
  return item;
}

async function fetchWatchlistOrThrow(
  db: ReturnType<typeof getDb>,
  watchlistId: number,
): Promise<{ id: number; name: string; itemOrderMode: WatchlistItemOrderMode }> {
  const watchlist = await db.query.watchlists.findFirst({
    where: eq(watchlists.id, watchlistId),
  });
  if (!watchlist) {
    throw new MoveItemError("Destination watchlist not found.");
  }
  return watchlist;
}

async function ensureNoDuplicate(
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
    throw new MoveItemError("already in destination");
  }
}

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

  if (!item.parentId) {
    return { success: false, message: "Item has no parent group." };
  }

  return moveParentGroup(db, item, item.parentId, destination, destinationWatchlistId, position);
}

async function moveParentGroup(
  db: ReturnType<typeof getDb>,
  item: WatchlistItemRow,
  parentId: string,
  destination: { id: number; name: string; itemOrderMode: WatchlistItemOrderMode },
  destinationWatchlistId: number,
  position?: InsertionPosition,
): Promise<MoveItemResult> {
  const siblings = await db.query.watchlistItems.findMany({
    where: and(
      eq(watchlistItems.watchlistId, item.watchlistId),
      eq(watchlistItems.parentId, parentId),
    ),
  });

  const allGroupItems = siblings.length > 0 ? siblings : [item];
  const duplicateFailure = await getGroupDuplicateFailure(
    db,
    allGroupItems,
    destinationWatchlistId,
  );
  if (duplicateFailure) {
    return duplicateFailure;
  }

  await executeGroupMove(db, allGroupItems, destination, position);

  return {
    success: true,
    movedCount: allGroupItems.length,
    message: `Moved ${groupMoveLabel(allGroupItems, item)} to ${destination.name}.`,
  };
}

async function loadMoveContext(
  db: ReturnType<typeof getDb>,
  itemId: number,
  destinationWatchlistId: number,
) {
  try {
    const item = await fetchItemOrThrow(db, itemId);
    const destination = await fetchWatchlistOrThrow(db, destinationWatchlistId);
    return { success: true as const, item, destination };
  } catch (error) {
    if (error instanceof MoveItemError) {
      return { success: false as const, message: error.message };
    }
    throw error;
  }
}

async function getGroupDuplicateFailure(
  db: ReturnType<typeof getDb>,
  items: WatchlistItemRow[],
  destinationWatchlistId: number,
): Promise<MoveItemResult | null> {
  try {
    await ensureNoDuplicatesForGroup(db, items, destinationWatchlistId);
    return null;
  } catch (error) {
    if (error instanceof MoveItemError) {
      return { success: false, message: error.message };
    }
    throw error;
  }
}

function groupMoveLabel(allGroupItems: WatchlistItemRow[], item: WatchlistItemRow) {
  return allGroupItems.length > 1 ? `${allGroupItems.length} items` : item.title;
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
