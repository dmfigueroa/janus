import { z } from "zod";

export const moveItemToWatchlistSchema = z.object({
  itemId: z.number(),
  destinationWatchlistId: z.number(),
});

export type MoveItemToWatchlistInput = z.infer<typeof moveItemToWatchlistSchema>;
