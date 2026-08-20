import type { DeleteWatchlistInput } from "./Mutation";
import { deleteWatchlist } from "@/features/watchlists/Repository.server";

export async function deleteWatchlistMutation({ id }: DeleteWatchlistInput) {
  await deleteWatchlist(id);
  return { success: true };
}
