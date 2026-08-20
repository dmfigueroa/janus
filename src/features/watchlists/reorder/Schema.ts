import { z } from "zod";

export const reorderItemsSchema = z.object({
  watchlistId: z.coerce.number(),
  movedItemId: z.coerce.number(),
  referenceItemId: z.coerce.number(),
  position: z.enum(["before", "after"]),
});

export type ReorderItemsInput = z.infer<typeof reorderItemsSchema>;
