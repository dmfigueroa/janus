"use server";

import { Watchlist, type WatchlistListOrder, type WatchlistSummary } from "@/models/watchlist";

export type WatchlistListScreenSummary = WatchlistSummary;

export const WatchlistsRead = {
  async listScreen({
    orderBy = "createdAt",
    order = "desc",
  }: {
    orderBy?: WatchlistListOrder;
    order?: "asc" | "desc";
  } = {}): Promise<WatchlistListScreenSummary[]> {
    return Watchlist.listSummaries({ orderBy, order });
  },
};
