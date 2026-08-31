import type { WatchlistListOrder, WatchlistSummary } from "@/features/watchlists/list/Query";
import type { WatchlistDetailPage } from "@/features/watchlists/detail/Query";
import { listWatchlistSummaries } from "@/features/watchlists/list/Query.server";
import {
  getWatchlistDetail,
  type GetWatchlistDetailParams,
} from "@/features/watchlists/detail/Query.server";
import { buildWatchlistHome } from "@/features/watchlists/home/WatchlistHome";

export type WatchlistListScreenSummary = WatchlistSummary;

export type WatchlistDetailScreenParams = GetWatchlistDetailParams;
export const WatchlistsRead = {
  async listScreen(
    options: {
      orderBy?: WatchlistListOrder;
      order?: "asc" | "desc";
    } = {},
  ): Promise<WatchlistListScreenSummary[]> {
    return listWatchlistSummaries(options);
  },

  async detailScreen(params: WatchlistDetailScreenParams): Promise<WatchlistDetailPage | null> {
    return getWatchlistDetail(params);
  },

  async homeScreen() {
    return buildWatchlistHome(await listWatchlistSummaries({ orderBy: "recency" }));
  },
};
