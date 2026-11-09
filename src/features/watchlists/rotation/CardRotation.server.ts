import { and, eq } from "drizzle-orm";
import { getDb, type DatabaseTransaction } from "@/db/Db.server";
import { watchlistItems, watchlists } from "@/db/Schema";
import { activeItemOrderExpression, isUnwatchedExpression } from "../Order.server";
import { nextRotationPosition } from "../lifecycle/WatchlistLifecycle.server";
import type { CardRotationInput, CardRotationReceipt } from "./CardRotation";

export function applyCardRotation(input: CardRotationInput) {
  return getDb().transaction((transaction) => {
    const watchlist = transaction
      .select()
      .from(watchlists)
      .where(eq(watchlists.id, input.watchlistId))
      .get();
    if (!isActive(watchlist))
      return { success: false as const, message: "This watchlist is no longer active." };

    const nextItem = transaction
      .select({ id: watchlistItems.id })
      .from(watchlistItems)
      .innerJoin(watchlists, eq(watchlists.id, watchlistItems.watchlistId))
      .where(
        and(eq(watchlistItems.watchlistId, input.watchlistId), isUnwatchedExpression),
      )
      .orderBy(activeItemOrderExpression)
      .get();
    if (!matchesNextItem(nextItem, input.itemId))
      return { success: false as const, message: "The next item changed. Refresh and try again." };
    updateCardItem(transaction, input, true);
    const updated = transaction
      .update(watchlists)
      .set({ lastWatchedAt: nextRotationPosition() })
      .where(eq(watchlists.id, input.watchlistId))
      .returning()
      .get()!;
    return {
      success: true as const,
      receipt: {
        ...input,
        previousPosition: watchlist.lastWatchedAt,
        appliedPosition: updated.lastWatchedAt!,
      },
    };
  });
}

export function undoCardRotation(receipt: CardRotationReceipt) {
  return getDb().transaction((transaction) => {
    const watchlist = transaction
      .select()
      .from(watchlists)
      .where(eq(watchlists.id, receipt.watchlistId))
      .get();
    const item = transaction
      .select()
      .from(watchlistItems)
      .where(
        and(
          eq(watchlistItems.id, receipt.itemId),
          eq(watchlistItems.watchlistId, receipt.watchlistId),
        ),
      )
      .get();
    if (!canUndo(watchlist, item, receipt)) {
      return {
        success: false as const,
        message: "This watchlist changed since that action. Undo is no longer available.",
      };
    }
    updateCardItem(transaction, receipt, false);
    transaction
      .update(watchlists)
      .set({ lastWatchedAt: receipt.previousPosition })
      .where(eq(watchlists.id, receipt.watchlistId))
      .run();
    return { success: true as const };
  });
}

function isActive(
  watchlist: typeof watchlists.$inferSelect | undefined,
): watchlist is typeof watchlists.$inferSelect {
  if (!watchlist) return false;
  return watchlist.pausedAt === null;
}
function updateCardItem(
  transaction: DatabaseTransaction,
  input: CardRotationInput,
  isWatched: boolean,
) {
  if (input.action !== "watched") return;
  transaction
    .update(watchlistItems)
    .set({ isWatched })
    .where(eq(watchlistItems.id, input.itemId))
    .run();
}
function canUndo(
  watchlist: typeof watchlists.$inferSelect | undefined,
  item: typeof watchlistItems.$inferSelect | undefined,
  receipt: CardRotationReceipt,
) {
  if (!watchlist || !item) return false;
  return matchingUndoState(watchlist, item, receipt);
}
function matchingUndoState(
  watchlist: typeof watchlists.$inferSelect,
  item: typeof watchlistItems.$inferSelect,
  receipt: CardRotationReceipt,
) {
  const itemMatches = receipt.action === "skip" || item.isWatched;
  return watchlist.lastWatchedAt === receipt.appliedPosition && itemMatches;
}

function matchesNextItem(item: { id: number } | undefined, itemId: number) {
  return item?.id === itemId;
}
