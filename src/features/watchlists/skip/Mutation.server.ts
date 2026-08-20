import type { SkipWatchlistInput } from "./Mutation";
import { markLastWatched } from "@/features/watchlists/Repository.server";

export async function skipWatchlistMutation({ watchlistId }: SkipWatchlistInput) {
  await markLastWatched(watchlistId);
  return { success: true };
}
