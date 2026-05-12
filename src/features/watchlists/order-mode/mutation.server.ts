import type { UpdateWatchlistItemOrderModeInput } from "./mutation";
import {
  getWatchlistById,
  updateWatchlistItemOrderMode,
} from "@/features/watchlists/repository.server";

export type UpdateWatchlistItemOrderModeResult =
  | { success: true }
  | { success: false; message: string };

export async function updateWatchlistItemOrderModeMutation({
  watchlistId,
  itemOrderMode,
}: UpdateWatchlistItemOrderModeInput): Promise<UpdateWatchlistItemOrderModeResult> {
  const watchlist = await getWatchlistById(watchlistId);

  if (!watchlist) {
    return { success: false, message: "Watchlist not found." };
  }

  await updateWatchlistItemOrderMode({ watchlistId, itemOrderMode });

  return { success: true };
}
