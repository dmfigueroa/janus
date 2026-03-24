"use server";

import {
  Watchlist,
  type WatchlistDetailPage,
  type WatchlistListOrder,
  type WatchlistSummary,
} from "@/models/watchlist";

export type WatchlistListScreenSummary = WatchlistSummary;

export type WatchlistDetailScreenParams = {
  watchlistId: number;
  cursor?: number;
  pageSize?: number;
  query?: string;
  unwatchedOnly?: boolean;
};

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

  async detailScreen(params: WatchlistDetailScreenParams): Promise<WatchlistDetailPage | null> {
    return Watchlist.getDetail(params);
  },
};
