import type { SkipWatchlistInput } from "./Mutation";
import { getWatchlistById, markLastWatched } from "@/features/watchlists/Repository.server";

export async function skipWatchlistMutation({ watchlistId }: SkipWatchlistInput) {
  const watchlist = await getWatchlistById(watchlistId);
  if (!watchlist) return { success: false as const, message: "Watchlist not found." };

  await markLastWatched(watchlistId);
  return { success: true as const };
}
