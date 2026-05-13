import { z } from "zod";

export const reorderItemsSchema = z.object({
  watchlistId: z.coerce.number(),
  itemIds: z.array(z.coerce.number()),
});

export type ReorderItemsInput = z.infer<typeof reorderItemsSchema>;
