import { Watchlist, type WatchlistDetailPage } from "@/models/watchlist";

export type GetWatchlistDetailParams = {
  watchlistId: number;
  cursor?: number;
  pageSize?: number;
  query?: string;
  unwatchedOnly?: boolean;
};

export async function getWatchlistDetail(
  params: GetWatchlistDetailParams,
): Promise<WatchlistDetailPage | null> {
  return Watchlist.getDetail(params);
}
