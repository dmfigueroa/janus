import { z } from "zod";

export const removeWatchlistItemSchema = z.object({
  watchlistId: z.number(),
  itemId: z.number(),
});

export const watchlistParentRemovalSchema = z.object({
  watchlistId: z.number(),
  parentId: z.string().min(1),
});

export type RemoveWatchlistItemInput = z.infer<typeof removeWatchlistItemSchema>;
export type WatchlistParentRemovalInput = z.infer<typeof watchlistParentRemovalSchema>;
