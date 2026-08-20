import type { UpdateWatchlistInput } from "./Mutation";
import { getWatchlistById, updateWatchlist } from "@/features/watchlists/Repository.server";

export type UpdateWatchlistResult = { success: true } | { success: false; message: string };

export async function updateWatchlistMutation(
  input: UpdateWatchlistInput,
): Promise<UpdateWatchlistResult> {
  const watchlist = await getWatchlistById(input.watchlistId);

  if (!watchlist) {
    return { success: false, message: "Watchlist not found." };
  }

  await updateWatchlist(input);

  return { success: true };
}
