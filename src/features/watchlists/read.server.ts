import {
  type WatchlistDetailPage,
  type WatchlistListOrder,
  type WatchlistSummary,
} from "@/models/watchlist";
import { listWatchlistSummaries } from "@/features/watchlists/list/query.server";
import {
  getWatchlistDetail,
  type GetWatchlistDetailParams,
} from "@/features/watchlists/detail/query.server";
import {
  getWatchlistHome,
  type WatchlistHomeScreen,
} from "@/features/watchlists/home/query.server";

export type WatchlistListScreenSummary = WatchlistSummary;

export type WatchlistDetailScreenParams = GetWatchlistDetailParams;
export type WatchlistHomeScreenData = WatchlistHomeScreen;

export const WatchlistsRead = {
  async listScreen({
    orderBy = "createdAt",
    order = "desc",
  }: {
    orderBy?: WatchlistListOrder;
    order?: "asc" | "desc";
  } = {}): Promise<WatchlistListScreenSummary[]> {
    return listWatchlistSummaries({ orderBy, order });
  },

  async detailScreen(params: WatchlistDetailScreenParams): Promise<WatchlistDetailPage | null> {
    return getWatchlistDetail(params);
  },

  async homeScreen(): Promise<WatchlistHomeScreenData> {
    return getWatchlistHome();
  },
};
