import type { Watchlist as WatchlistRecord, WatchlistItem } from "../db/schema";
import { watchlists } from "../db/schema";
import { getDb } from "../db/db.server";
import { listWatchlistSummaries } from "@/features/watchlists/list/query.server";
import type { WatchlistListOrder, WatchlistSummary } from "@/features/watchlists/list/query.server";
import type { WatchlistStats } from "@/features/watchlists/summary.server";
import { eq } from "drizzle-orm";

export type { WatchlistListOrder, WatchlistSummary, WatchlistStats };

export type WatchlistDetailPage = {
  watchlist: WatchlistSummary;
  items: WatchlistItem[];
  nextCursor?: number;
};

export const Watchlist = {
  async listSummaries({
    orderBy = "createdAt",
    order = "desc",
  }: {
    orderBy?: WatchlistListOrder;
    order?: "asc" | "desc";
  } = {}): Promise<WatchlistSummary[]> {
    return listWatchlistSummaries({ orderBy, order });
  },

  async create({
    name,
    description,
  }: {
    name: string;
    description?: string;
  }): Promise<WatchlistRecord> {
    const db = getDb();
    const [watchlist] = await db
      .insert(watchlists)
      .values({
        name,
        description,
      })
      .returning();

    return watchlist;
  },

  async destroy(id: number): Promise<void> {
    const db = getDb();
    await db.delete(watchlists).where(eq(watchlists.id, id));
  },
};
