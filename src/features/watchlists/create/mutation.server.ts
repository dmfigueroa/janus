import type { CreateWatchlistInput } from "./mutation";
import { createWatchlist } from "@/features/watchlists/repository.server";

export async function createWatchlistMutation(input: CreateWatchlistInput) {
  return createWatchlist(input);
}
