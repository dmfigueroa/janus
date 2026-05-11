import type { CreateWatchlistInput } from "@/features/watchlists/mutations";
import { createWatchlist } from "@/features/watchlists/repository.server";

export async function createWatchlistMutation(input: CreateWatchlistInput) {
  return createWatchlist(input);
}
