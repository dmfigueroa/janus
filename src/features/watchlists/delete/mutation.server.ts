import type { DeleteWatchlistInput } from "./mutation";
import { deleteWatchlist } from "@/features/watchlists/repository.server";

export async function deleteWatchlistMutation({ id }: DeleteWatchlistInput) {
  await deleteWatchlist(id);
  return { success: true };
}
