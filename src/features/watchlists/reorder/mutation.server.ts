import { getDb } from "@/db/db.server";
import { watchlistItems, watchlists } from "@/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import type { ReorderItemsInput } from "./schema";

export async function reorderItems({
  watchlistId,
  movedItemId,
  referenceItemId,
  position,
}: ReorderItemsInput) {
  const db = getDb();

  if (movedItemId === referenceItemId) {
    return { success: false, message: "Moved item and reference item must differ" };
  }

  return db.transaction((tx) => {
    const [watchlist] = tx
      .select({ itemOrderMode: watchlists.itemOrderMode })
      .from(watchlists)
      .where(eq(watchlists.id, watchlistId))
      .all();

    if (!watchlist || watchlist.itemOrderMode !== "custom") {
      return { success: false, message: "Reordering is only available in custom mode" };
    }

    const existingItems = tx
      .select({
        id: watchlistItems.id,
        customRank: watchlistItems.customRank,
      })
      .from(watchlistItems)
      .where(eq(watchlistItems.watchlistId, watchlistId))
      .orderBy(
        sql`CASE WHEN ${watchlistItems.customRank} IS NULL THEN 1 ELSE 0 END`,
        asc(watchlistItems.customRank),
        asc(watchlistItems.id),
      )
      .all();

    const validIds = new Set(existingItems.map((item) => item.id));
    if (!validIds.has(movedItemId) || !validIds.has(referenceItemId)) {
      return { success: false, message: "Some items do not belong to this watchlist" };
    }

    const orderedIds = existingItems.map((item) => item.id);
    const oldIndex = orderedIds.indexOf(movedItemId);
    const remainingIds = orderedIds.filter((itemId) => itemId !== movedItemId);
    const referenceIndex = remainingIds.indexOf(referenceItemId);

    if (oldIndex === -1 || referenceIndex === -1) {
      return { success: false, message: "Some items do not belong to this watchlist" };
    }

    const nextIndex = position === "before" ? referenceIndex : referenceIndex + 1;
    remainingIds.splice(nextIndex, 0, movedItemId);

    const reorderedIndex = remainingIds.indexOf(movedItemId);

    if (reorderedIndex === oldIndex) {
      return { success: true };
    }

    const sliceStart = Math.min(oldIndex, reorderedIndex);
    const sliceEnd = Math.max(oldIndex, reorderedIndex);
    const affectedIds = remainingIds.slice(sliceStart, sliceEnd + 1);

    for (const [offset, itemId] of affectedIds.entries()) {
      tx.update(watchlistItems)
        .set({ customRank: sliceStart + offset + 1 })
        .where(and(eq(watchlistItems.id, itemId), eq(watchlistItems.watchlistId, watchlistId)))
        .run();
    }

    return { success: true };
  });
}
