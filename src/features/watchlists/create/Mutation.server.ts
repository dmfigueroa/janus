import type { CreateWatchlistInput } from "./Mutation";
import { createWatchlist } from "@/features/watchlists/Repository.server";

export async function createWatchlistMutation(input: CreateWatchlistInput) {
  return createWatchlist(input);
}
