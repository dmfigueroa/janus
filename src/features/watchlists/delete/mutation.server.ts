import type { DeleteWatchlistInput } from "@/features/watchlists/mutations";
import { deleteWatchlist } from "@/features/watchlists/repository.server";

export async function deleteWatchlistMutation({ id }: DeleteWatchlistInput) {
  await deleteWatchlist(id);
  return { success: true };
}
