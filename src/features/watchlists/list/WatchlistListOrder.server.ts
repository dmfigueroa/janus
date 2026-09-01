import { asc, desc, sql } from "drizzle-orm";
import { watchlists } from "@/db/Schema";
import type { WatchlistListOrder } from "./Query.server";

export function buildListOrderBy(orderBy: WatchlistListOrder, order: "asc" | "desc") {
  const builder = listOrderBuilders[orderBy] ?? listOrderBuilders.createdAt;
  return builder(order === "desc" ? desc : asc, order);
}

type OrderFunction = typeof asc;

const listOrderBuilders = {
  lastWatched: (orderFunction: OrderFunction, order: "asc" | "desc") => [
    order === "desc"
      ? sql`CASE WHEN ${watchlists.lastWatchedAt} IS NULL THEN 1 ELSE 0 END`
      : sql`CASE WHEN ${watchlists.lastWatchedAt} IS NULL THEN 0 ELSE 1 END`,
    orderFunction(watchlists.lastWatchedAt),
    orderFunction(watchlists.id),
  ],
  lastAdded: (orderFunction: OrderFunction) => [
    orderFunction(sql`COALESCE(${watchlists.lastItemAddedAt}, ${watchlists.createdAt})`),
    orderFunction(watchlists.id),
  ],
  recency: () => [
    sql`CASE WHEN ${watchlists.lastWatchedAt} IS NULL THEN 0 ELSE 1 END`,
    asc(watchlists.lastWatchedAt),
    asc(watchlists.createdAt),
    asc(watchlists.id),
  ],
  createdAt: (orderFunction: OrderFunction) => [
    orderFunction(watchlists.createdAt),
    orderFunction(watchlists.id),
  ],
} satisfies Record<
  WatchlistListOrder,
  (orderFunction: OrderFunction, order: "asc" | "desc") => unknown[]
>;
