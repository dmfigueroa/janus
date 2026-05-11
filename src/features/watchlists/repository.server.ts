import { getDb } from "@/db/db.server";
import { watchlists } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { MergeWatchlistsInput } from "@/features/watchlists/mutations";
import type { WatchlistItemOrderMode } from "@/features/watchlists/order";

export async function createWatchlist({
  description,
  name,
}: {
  name: string;
  description?: string;
}) {
  const db = getDb();
  const [watchlist] = await db.insert(watchlists).values({ name, description }).returning();
  return watchlist;
}

export async function deleteWatchlist(id: number) {
  const db = getDb();
  await db.delete(watchlists).where(eq(watchlists.id, id));
}

export async function getWatchlistById(watchlistId: number) {
  const db = getDb();
  const [watchlist] = await db
    .select()
    .from(watchlists)
    .where(eq(watchlists.id, watchlistId))
    .limit(1);
  return watchlist ?? null;
}

export async function hasCustomOrderMergeParticipant({
  targetWatchlistId,
  sourceWatchlistIds,
}: Pick<MergeWatchlistsInput, "targetWatchlistId" | "sourceWatchlistIds">) {
  const participantIds = Array.from(
    new Set(targetWatchlistId ? [...sourceWatchlistIds, targetWatchlistId] : sourceWatchlistIds),
  );

  const db = getDb();
  const [customOrderParticipant] = await db
    .select({ id: watchlists.id })
    .from(watchlists)
    .where(and(inArray(watchlists.id, participantIds), eq(watchlists.itemOrderMode, "custom")))
    .limit(1);

  return customOrderParticipant !== undefined;
}

export async function markLastItemAdded(watchlistId: number) {
  const db = getDb();
  await db
    .update(watchlists)
    .set({ lastItemAddedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(watchlists.id, watchlistId));
}

export async function markLastWatched(watchlistId: number) {
  const db = getDb();
  await db
    .update(watchlists)
    .set({ lastWatchedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(watchlists.id, watchlistId));
}

export async function updateWatchlistItemOrderMode({
  itemOrderMode,
  watchlistId,
}: {
  watchlistId: number;
  itemOrderMode: WatchlistItemOrderMode;
}) {
  const db = getDb();
  await db.update(watchlists).set({ itemOrderMode }).where(eq(watchlists.id, watchlistId));
}
