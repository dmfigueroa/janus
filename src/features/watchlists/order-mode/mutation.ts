import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { WatchlistItemOrderMode } from "@/features/watchlists/order";

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
    const { WatchlistsWrite } = await import("../write.server");
    return WatchlistsWrite.updateItemOrderMode(data);
  });
