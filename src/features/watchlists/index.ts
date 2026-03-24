import { notFound } from "@tanstack/react-router";

import {
  getWatchlistDetail,
  getWatchlistSummaries,
  type GetWatchlistDetailResult,
} from "@/controllers/watchlists";
import { Watchlist } from "@/models/watchlist";

export { getWatchlistDetail, getWatchlistSummaries };
export type { GetWatchlistDetailResult };

export async function loadWatchlistsIndex() {
  return Watchlist.listSummaries({
    orderBy: "lastWatched",
    order: "asc",
  });
}

export async function loadWatchlistDetailPage(watchlistId: string) {
  const detail = await Watchlist.getDetail({
    watchlistId: Number.parseInt(watchlistId, 10),
    unwatchedOnly: true,
  });

  if (!detail) {
    throw notFound();
  }

  return detail;
}
