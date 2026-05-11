import { getDb } from "@/db/db.server";
import { watchlists, watchlistItems } from "@/db/schema";
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

export async function insertWatchlistItem(values: typeof watchlistItems.$inferInsert) {
  const db = getDb();
  const [inserted] = await db
    .insert(watchlistItems)
    .values(values)
    .onConflictDoNothing()
    .returning({ id: watchlistItems.id });
  return inserted;
}

export async function insertWatchlistItems(values: Array<typeof watchlistItems.$inferInsert>) {
  if (values.length === 0) return;
  const db = getDb();
  const DB_INSERT_CHUNK_SIZE = 50;
  for (let index = 0; index < values.length; index += DB_INSERT_CHUNK_SIZE) {
    const chunk = values.slice(index, index + DB_INSERT_CHUNK_SIZE);
    await db.insert(watchlistItems).values(chunk).onConflictDoNothing();
  }
}

export async function getExistingMovieInWatchlist(watchlistId: number, tmdbId: number) {
  const db = getDb();
  return db
    .select()
    .from(watchlistItems)
    .where(
      and(
        eq(watchlistItems.watchlistId, watchlistId),
        eq(watchlistItems.tmdbId, tmdbId.toString()),
        eq(watchlistItems.mediaType, "movie"),
      ),
    )
    .limit(1);
}

export async function getExistingEpisodesInWatchlist(watchlistId: number) {
  const db = getDb();
  const rows = await db
    .select({ tmdbId: watchlistItems.tmdbId })
    .from(watchlistItems)
    .where(
      and(
        eq(watchlistItems.watchlistId, watchlistId),
        eq(watchlistItems.mediaType, "episode"),
        eq(watchlistItems.source, "tmdb"),
      ),
    );
  return new Set(rows.map((row) => row.tmdbId));
}

export async function getExistingComicsInWatchlist(watchlistId: number) {
  const db = getDb();
  const rows = await db
    .select({ tmdbId: watchlistItems.tmdbId })
    .from(watchlistItems)
    .where(
      and(
        eq(watchlistItems.watchlistId, watchlistId),
        eq(watchlistItems.mediaType, "comic"),
        eq(watchlistItems.source, "comicvine"),
      ),
    );
  return new Set(rows.map((row) => row.tmdbId));
}
