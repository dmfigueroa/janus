import {
  Watchlist,
  type WatchlistDetailPage,
  type WatchlistListOrder,
  type WatchlistSummary,
} from "@/models/watchlist";
import {
  getWatchlistDetail,
  type GetWatchlistDetailParams,
} from "@/features/watchlists/detail/query.server";

export type WatchlistListScreenSummary = WatchlistSummary;

export type WatchlistDetailScreenParams = GetWatchlistDetailParams;

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
    return getWatchlistDetail(params);
  },
};
