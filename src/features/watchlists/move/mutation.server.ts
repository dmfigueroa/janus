import { getDb } from "@/db/db.server";
import { watchlistItems, watchlists } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

type MoveItemResult =
  | { success: true; movedCount: number; message: string }
  | { success: false; message: string };

export async function moveItemToWatchlistMutation({
  itemId,
  destinationWatchlistId,
}: {
  itemId: number;
  destinationWatchlistId: number;
}): Promise<MoveItemResult> {
  const db = getDb();

  let item: WatchlistItemRow;
  let destination: { name: string };

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

  await executeMove(db, itemId, item, destinationWatchlistId);

  return {
    success: true,
    movedCount: 1,
    message: `Moved ${item.title} to ${destination.name}.`,
  };
}

type WatchlistItemRow = typeof watchlistItems.$inferSelect;

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
): Promise<{ name: string }> {
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
    throw new MoveItemError(`already in destination`);
  }
}

function executeMove(
  db: ReturnType<typeof getDb>,
  itemId: number,
  item: WatchlistItemRow,
  destinationWatchlistId: number,
) {
  return db.transaction((transaction) => {
    transaction.delete(watchlistItems).where(eq(watchlistItems.id, itemId)).run();
    transaction
      .insert(watchlistItems)
      .values({ watchlistId: destinationWatchlistId, ...itemFieldsForInsert(item) })
      .run();
    transaction
      .update(watchlists)
      .set({ lastItemAddedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(watchlists.id, destinationWatchlistId))
      .run();
  });
}

function itemFieldsForInsert(item: WatchlistItemRow) {
  const { id: _id, watchlistId: _watchlistId, ...rest } = item;
  void _id;
  void _watchlistId;
  return rest;
}

class MoveItemError {
  constructor(public message: string) {}
}
