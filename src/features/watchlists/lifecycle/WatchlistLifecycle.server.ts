import { getDb, type DatabaseTransaction } from "@/db/Db.server";
import { watchlistItems, watchlists } from "@/db/Schema";
import type { SetWatchedStateInput } from "../watched/SetWatchedState";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  initialWatchlistLifecycle,
  nextRotationPosition,
} from "./WatchlistRotationPosition.server";

export { initialWatchlistLifecycle, nextRotationPosition };

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

export async function pauseWatchlistMutation({ watchlistId }: { watchlistId: number }) {
  return updateLifecycle(watchlistId, {
    pausedAt: sql`COALESCE(${watchlists.pausedAt}, CURRENT_TIMESTAMP)`,
  });
}

export async function resumeWatchlistMutation({ watchlistId }: { watchlistId: number }) {
  return updateLifecycle(watchlistId, { pausedAt: null });
}

export async function skipWatchlistMutation({ watchlistId }: { watchlistId: number }) {
  return getDb().transaction((transaction) => {
    const watchlist = transaction
      .select({ id: watchlists.id, pausedAt: watchlists.pausedAt })
      .from(watchlists)
      .where(eq(watchlists.id, watchlistId))
      .get();

    if (!watchlist) {
      return {
        success: false as const,
        code: "not_found" as const,
        message: "Watchlist not found.",
      };
    }

    if (watchlist.pausedAt !== null) {
      return {
        success: false as const,
        code: "validation_error" as const,
        message: "Paused watchlists cannot be skipped.",
      };
    }

    transaction
      .update(watchlists)
      .set({ lastWatchedAt: nextRotationPosition() })
      .where(and(eq(watchlists.id, watchlistId), isNull(watchlists.pausedAt)))
      .run();

    return { success: true as const };
  });
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
