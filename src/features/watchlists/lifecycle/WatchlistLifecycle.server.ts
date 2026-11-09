import { getDb, type DatabaseTransaction } from "@/db/Db.server";
import { watchlistItems, watchlists } from "@/db/Schema";
import type { SetWatchedStateInput } from "../watched/SetWatchedState";
import { eq, sql } from "drizzle-orm";

export async function setWatchedStateMutation({
  itemId,
  isWatched,
  updateWatchlistRecency = true,
}: SetWatchedStateInput) {
  return getDb().transaction((transaction) => {
    const item = transaction
      .select({ watchlistId: watchlistItems.watchlistId, isWatched: watchlistItems.isWatched })
      .from(watchlistItems)
      .where(eq(watchlistItems.id, itemId))
      .get();

    if (!item) return { success: false as const, message: "Item not found." };
    if (item.isWatched === isWatched) return { success: true as const };

    persistWatchedState(transaction, item.watchlistId, {
      itemId,
      isWatched,
      updateWatchlistRecency,
    });
    return { success: true as const };
  });
}

function persistWatchedState(
  transaction: DatabaseTransaction,
  watchlistId: number,
  { itemId, isWatched, updateWatchlistRecency }: SetWatchedStateInput,
) {
  transaction.update(watchlistItems).set({ isWatched }).where(eq(watchlistItems.id, itemId)).run();
  if (isWatched && updateWatchlistRecency) {
    transaction
      .update(watchlists)
      .set({ lastWatchedAt: nextRotationPosition() })
      .where(eq(watchlists.id, watchlistId))
      .run();
  }
}

/** New ordinary and merged watchlists join the back of the global rotation. */
export function initialWatchlistLifecycle() {
  return { pausedAt: null, lastWatchedAt: nextRotationPosition() };
}

export async function pauseWatchlistMutation({ watchlistId }: { watchlistId: number }) {
  return updateLifecycle(watchlistId, {
    pausedAt: sql`COALESCE(${watchlists.pausedAt}, CURRENT_TIMESTAMP)`,
  });
}

export async function resumeWatchlistMutation({ watchlistId }: { watchlistId: number }) {
  return updateLifecycle(watchlistId, { pausedAt: null });
}

export async function skipWatchlistMutation({ watchlistId }: { watchlistId: number }) {
  return updateLifecycle(watchlistId, { lastWatchedAt: nextRotationPosition() });
}

function updateLifecycle(
  watchlistId: number,
  changes: Partial<Record<"pausedAt" | "lastWatchedAt", ReturnType<typeof sql> | null>>,
) {
  const updated = getDb()
    .update(watchlists)
    .set(changes)
    .where(eq(watchlists.id, watchlistId))
    .returning({ id: watchlists.id })
    .get();
  return updated
    ? { success: true as const }
    : { success: false as const, message: "Watchlist not found." };
}

// lastWatchedAt is the legacy storage name for rotation position, including skips.
// Millisecond monotonicity makes separate actions advance even within one clock tick.
export function nextRotationPosition() {
  return sql`strftime('%Y-%m-%d %H:%M:%f', MAX(
    julianday('now'),
    COALESCE((SELECT MAX(julianday(${watchlists.lastWatchedAt})) FROM ${watchlists}), 0)
      + 1.0 / 86400000
  ))`;
}
