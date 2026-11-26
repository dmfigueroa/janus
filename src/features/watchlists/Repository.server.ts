import { initialWatchlistLifecycle } from "./lifecycle/WatchlistLifecycle.server";
import { getDb, type DatabaseTransaction } from "@/db/Db.server";
import { watchlists, watchlistItems } from "@/db/Schema";
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import type { WatchlistItemOrderMode } from "@/features/watchlists/Order";
import { releaseDateOrder } from "@/features/watchlists/Order.server";

type WatchlistDatabase = ReturnType<typeof getDb> | DatabaseTransaction;

export async function createWatchlist({
  description,
  name,
  itemOrderMode,
}: {
  name: string;
  description?: string;
  itemOrderMode?: WatchlistItemOrderMode;
}) {
  const db = getDb();
  const [watchlist] = await db
    .insert(watchlists)
    .values({ name, description, itemOrderMode, ...initialWatchlistLifecycle() })
    .returning();
  return watchlist;
}

export async function deleteWatchlist(id: number) {
  const db = getDb();
  await db.delete(watchlists).where(eq(watchlists.id, id));
}

export function getWatchlistById(watchlistId: number, database: WatchlistDatabase = getDb()) {
  const [watchlist] = database
    .select()
    .from(watchlists)
    .where(eq(watchlists.id, watchlistId))
    .limit(1)
    .all();
  return watchlist ?? null;
}

export async function markLastItemAdded(watchlistId: number) {
  const db = getDb();
  await db
    .update(watchlists)
    .set({ lastItemAddedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(watchlists.id, watchlistId));
}

export async function updateWatchlist({
  watchlistId,
  name,
  description,
  itemOrderMode,
}: {
  watchlistId: number;
  name?: string;
  description?: string | null;
  itemOrderMode?: WatchlistItemOrderMode;
}): Promise<boolean> {
  const fieldsToUpdate = buildWatchlistUpdateFields({ name, description, itemOrderMode });
  const db = getDb();

  return db.transaction((transaction) =>
    applyWatchlistUpdate(transaction, watchlistId, fieldsToUpdate, itemOrderMode),
  );
}

function buildWatchlistUpdateFields({
  name,
  description,
  itemOrderMode,
}: {
  name?: string;
  description?: string | null;
  itemOrderMode?: WatchlistItemOrderMode;
}) {
  return Object.fromEntries(
    Object.entries({
      name,
      description: description === "" ? null : description,
      itemOrderMode,
    }).filter(([, value]) => value !== undefined),
  );
}

function applyWatchlistUpdate(
  transaction: DatabaseTransaction,
  watchlistId: number,
  fieldsToUpdate: Record<string, unknown>,
  itemOrderMode: WatchlistItemOrderMode | undefined,
): boolean {
  const watchlist = getWatchlistById(watchlistId, transaction);
  if (!watchlist) return false;

  if (itemOrderMode === "custom") {
    initializeCustomRanksIfUnranked(transaction, watchlistId);
  }

  transaction.update(watchlists).set(fieldsToUpdate).where(eq(watchlists.id, watchlistId)).run();
  return true;
}

function initializeCustomRanksIfUnranked(transaction: DatabaseTransaction, watchlistId: number) {
  const existingRanked = transaction
    .select({ id: watchlistItems.id })
    .from(watchlistItems)
    .where(and(eq(watchlistItems.watchlistId, watchlistId), isNotNull(watchlistItems.customRank)))
    .limit(1)
    .all();
  if (existingRanked.length > 0) return;

  const orderedItems = transaction
    .select({ id: watchlistItems.id })
    .from(watchlistItems)
    .where(eq(watchlistItems.watchlistId, watchlistId))
    .orderBy(...releaseDateOrder, asc(watchlistItems.id))
    .all();

  orderedItems.forEach((item, index) => {
    transaction
      .update(watchlistItems)
      .set({ customRank: index + 1 })
      .where(and(eq(watchlistItems.id, item.id), eq(watchlistItems.watchlistId, watchlistId)))
      .run();
  });
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

export async function getExistingEpisodesInWatchlist(watchlistId: number, showId: number) {
  const db = getDb();
  const rows = await db
    .select({ tmdbId: watchlistItems.tmdbId })
    .from(watchlistItems)
    .where(
      and(
        eq(watchlistItems.watchlistId, watchlistId),
        eq(watchlistItems.mediaType, "episode"),
        eq(watchlistItems.source, "tmdb"),
        eq(watchlistItems.parentId, `tmdb:${showId}`),
      ),
    );
  return new Set(rows.map((row) => row.tmdbId));
}

export async function getExistingComicsInWatchlist(watchlistId: number, volumeId: string) {
  const db = getDb();
  const rows = await db
    .select({ tmdbId: watchlistItems.tmdbId })
    .from(watchlistItems)
    .where(
      and(
        eq(watchlistItems.watchlistId, watchlistId),
        eq(watchlistItems.mediaType, "comic"),
        eq(watchlistItems.source, "comicvine"),
        eq(watchlistItems.parentId, `comicvine:${volumeId}`),
      ),
    );
  return new Set(rows.map((row) => row.tmdbId));
}

export function markLastItemAddedInTransaction(
  transaction: DatabaseTransaction,
  watchlistId: number,
) {
  transaction
    .update(watchlists)
    .set({ lastItemAddedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(watchlists.id, watchlistId))
    .run();
}
