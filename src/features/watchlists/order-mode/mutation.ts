import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { WatchlistItemOrderMode } from "@/features/watchlists/order";
import { updateWatchlistItemOrderModeMutation } from "./mutation.server";

export const updateWatchlistItemOrderModeSchema = z.object({
  watchlistId: z.number(),
  itemOrderMode: z.enum(["release", "custom"]),
});

export type UpdateWatchlistItemOrderModeInput = {
  watchlistId: number;
  itemOrderMode: WatchlistItemOrderMode;
};

export const updateWatchlistItemOrderMode = createServerFn({ method: "POST" })
  .inputValidator((data) => updateWatchlistItemOrderModeSchema.parse(data))
  .handler(async ({ data }) => {
    return updateWatchlistItemOrderModeMutation(data);
  });
