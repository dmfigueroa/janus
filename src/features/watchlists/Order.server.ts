import { watchlistItems, watchlists } from "@/db/Schema";
import { asc, sql } from "drizzle-orm";
import type { WatchlistItemOrderMode } from "@/features/watchlists/Order";

export const releaseDateOrder = [
  sql`CASE WHEN ${watchlistItems.releaseDate} IS NULL OR ${watchlistItems.releaseDate} = '' THEN 1 ELSE 0 END`,
  asc(watchlistItems.releaseDate),
] as const;

export const customRankOrder = [
  sql`CASE WHEN ${watchlistItems.customRank} IS NULL THEN 1 ELSE 0 END`,
  asc(watchlistItems.customRank),
  ...releaseDateOrder,
] as const;

export const isUnwatchedExpression = sql<boolean>`COALESCE(${watchlistItems.isWatched}, 0) = 0`;
export const watchedItemsExpression = sql<number>`sum(case when ${watchlistItems.isWatched} then 1 else 0 end)`;
export const isWatchedOrderExpression = sql<number>`CASE WHEN COALESCE(${watchlistItems.isWatched}, 0) = 1 THEN 1 ELSE 0 END`;

export const activeItemOrderExpression = sql`
  CASE WHEN ${watchlists.itemOrderMode} = 'custom' AND ${watchlistItems.customRank} IS NULL THEN 1 ELSE 0 END,
  CASE WHEN ${watchlists.itemOrderMode} = 'custom' THEN ${watchlistItems.customRank} END asc,
  CASE WHEN ${watchlistItems.releaseDate} IS NULL OR ${watchlistItems.releaseDate} = '' THEN 1 ELSE 0 END,
  ${watchlistItems.releaseDate} asc
`;

export function buildDetailOrderBy(itemOrderMode: WatchlistItemOrderMode) {
  return itemOrderMode === "custom" ? customRankOrder : releaseDateOrder;
}
