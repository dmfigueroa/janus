import { notFound } from "@tanstack/react-router";

import {
  getWatchlistDetail,
  getWatchlistSummaries,
  type GetWatchlistDetailResult,
} from "../../controllers/watchlists";

export { getWatchlistDetail, getWatchlistSummaries };
export type { GetWatchlistDetailResult };

export async function loadWatchlistsIndex() {
  return getWatchlistSummaries({
    data: { orderBy: "lastWatched", order: "asc" },
  });
}

export async function loadWatchlistDetailPage(watchlistId: string) {
  const detail = await getWatchlistDetail({
    data: { watchlistId: Number.parseInt(watchlistId, 10), unwatchedOnly: true },
  });

  if (!detail) {
    throw notFound();
  }

  return detail;
}
