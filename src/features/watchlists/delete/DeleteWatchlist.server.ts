import type { DeleteWatchlistInput } from "@/features/watchlists/lifecycle/WatchlistLifecycleActions";
import { deleteWatchlist, getWatchlistById } from "@/features/watchlists/Repository.server";

export async function deleteWatchlistMutation({ id }: DeleteWatchlistInput) {
  const watchlist = await getWatchlistById(id);
  if (!watchlist) return { success: false as const, message: "Watchlist not found." };

  await deleteWatchlist(id);
  return { success: true as const };
}
