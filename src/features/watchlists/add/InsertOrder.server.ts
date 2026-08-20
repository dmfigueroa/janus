import { watchlistItems } from "@/db/Schema";
import { toWatchlistItemKey } from "@/features/watchlists/ItemKey";
import type { OrderedWatchlistItem } from "./OrderInsertion";

type PersistedWatchlistItem = Pick<
  typeof watchlistItems.$inferSelect,
  "id" | "tmdbId" | "mediaType" | "releaseDate" | "customRank"
>;

type PendingWatchlistItem = typeof watchlistItems.$inferInsert;
type PendingWatchlistItemWithIndex = PendingWatchlistItem & { pendingIndex: number };

export function assignCustomRanks(ordered: OrderedWatchlistItem[]) {
  const inserts: Array<{ item: PendingWatchlistItemWithIndex; rank: number }> = [];
  const updates: Array<{ id: number; rank: number }> = [];

  for (const [index, item] of ordered.entries()) {
    const rank = index + 1;

    if ("pendingIndex" in item) {
      inserts.push({ item: item as PendingWatchlistItemWithIndex, rank });
    } else {
      updates.push({ id: item.id, rank });
    }
  }

  return { inserts, updates };
}

export function dedupePendingItems(
  items: PendingWatchlistItem[],
  existingItems: PersistedWatchlistItem[],
): typeof items {
  const existingKeys = new Set(existingItems.map(toWatchlistItemKey));
  const pendingKeys = new Set<string>();

  return items.filter((item) => {
    const itemKey = toWatchlistItemKey(item);
    if (existingKeys.has(itemKey) || pendingKeys.has(itemKey)) {
      return false;
    }

    pendingKeys.add(itemKey);
    return true;
  });
}
