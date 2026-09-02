import type { PauseWatchlistInput, ResumeWatchlistInput } from "./Mutation";
import {
  getWatchlistById,
  pauseWatchlist,
  resumeWatchlist,
} from "@/features/watchlists/Repository.server";

export async function pauseWatchlistMutation({ watchlistId }: PauseWatchlistInput) {
  const watchlist = await getWatchlistById(watchlistId);
  if (!watchlist) return { success: false as const, message: "Watchlist not found." };

  await pauseWatchlist(watchlistId);
  return { success: true as const };
}

export async function resumeWatchlistMutation({ watchlistId }: ResumeWatchlistInput) {
  const watchlist = await getWatchlistById(watchlistId);
  if (!watchlist) return { success: false as const, message: "Watchlist not found." };

  await resumeWatchlist(watchlistId);
  return { success: true as const };
}
