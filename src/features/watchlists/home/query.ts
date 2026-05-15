import { createServerFn } from "@tanstack/react-start";
import { getWatchlistHome, type WatchlistHomeScreen } from "./query.server";

export type WatchlistHomeQueryData = WatchlistHomeScreen;

export function watchlistHomeQueryKey() {
  return ["watchlists", "home"] as const;
}

export const getWatchlistHomeData = createServerFn().handler(async () => {
  return getWatchlistHome();
});
