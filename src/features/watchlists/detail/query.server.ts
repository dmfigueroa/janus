import { WatchlistsRead } from "../read.server";
import type { WatchlistDetailQueryFilters } from "./query";

export async function readWatchlistDetailRoute(filters: WatchlistDetailQueryFilters) {
  return WatchlistsRead.detailScreen(filters);
}
