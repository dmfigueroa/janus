import { z } from "zod";

export const moveItemToWatchlistSchema = z.object({
  itemId: z.number(),
  destinationWatchlistId: z.number(),
  position: z.enum(["beginning", "end", "release-adjacent"]).optional(),
});

export type MoveItemToWatchlistInput = z.infer<typeof moveItemToWatchlistSchema>;
