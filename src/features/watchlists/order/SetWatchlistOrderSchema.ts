import { z } from "zod";

export const setWatchlistOrderSchema = z.object({
  watchlistId: z.number().int().positive(),
  orderedItemIds: z.array(z.number().int().positive()).min(1),
  expectedOrderToken: z.string().trim().min(1).optional(),
});

export type SetWatchlistOrderInput = z.infer<typeof setWatchlistOrderSchema>;
