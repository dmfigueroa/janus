import type { UpdateWatchlistInput } from "./Mutation";
import { updateWatchlist } from "@/features/watchlists/Repository.server";

export type UpdateWatchlistResult = { success: true } | { success: false; message: string };

export async function updateWatchlistMutation(
  input: UpdateWatchlistInput,
): Promise<UpdateWatchlistResult> {
  const updated = await updateWatchlist(input);

  if (!updated) {
    return { success: false, message: "Watchlist not found." };
  }

  return { success: true };
}
