import type { SkipWatchlistInput } from "./mutation";
import { markLastWatched } from "@/features/watchlists/repository.server";

export async function skipWatchlistMutation({ watchlistId }: SkipWatchlistInput) {
  await markLastWatched(watchlistId);
  return { success: true };
}
