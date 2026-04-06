"use server";

import { Watchlist } from "@/models/watchlist";
import type { CreateWatchlistInput, DeleteWatchlistInput } from "./mutations";

export const WatchlistsWrite = {
  async create(input: CreateWatchlistInput) {
    return Watchlist.create(input);
  },

  async delete({ id }: DeleteWatchlistInput) {
    await Watchlist.destroy(id);
    return { success: true };
  },
};
