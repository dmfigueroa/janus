"use server";

import { Watchlist } from "@/models/watchlist";

export const WatchlistsWrite = {
  async create({ name, description }: { name: string; description?: string }) {
    return Watchlist.create({ name, description });
  },

  async delete({ id }: { id: number }) {
    await Watchlist.destroy(id);
    return { success: true };
  },
};
