import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { WatchlistItemOrderMode } from "@/features/watchlists/Order";
import { updateWatchlistMutation } from "./Mutation.server";

export const updateWatchlistSchema = z.object({
  watchlistId: z.number(),
  name: z.string().min(1, "Name is required"),
  description: z.string().nullable().optional(),
  itemOrderMode: z.enum(["release", "custom"]),
});

export type UpdateWatchlistInput = {
  watchlistId: number;
  name: string;
  description?: string | null;
  itemOrderMode: WatchlistItemOrderMode;
};

export const updateWatchlist = createServerFn({ method: "POST" })
  .inputValidator((data) => updateWatchlistSchema.parse(data))
  .handler(async ({ data }) => {
    return updateWatchlistMutation(data);
  });
