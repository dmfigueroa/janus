import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { applyCardRotation, undoCardRotation } from "./CardRotation.server";

const actionSchema = z.object({
  watchlistId: z.number().int().positive(),
  itemId: z.number().int().positive(),
  action: z.enum(["watched", "skip"]),
});
export type CardRotationInput = z.infer<typeof actionSchema>;
const receiptSchema = actionSchema.extend({
  previousPosition: z.string().nullable(),
  appliedPosition: z.string(),
});
export type CardRotationReceipt = z.infer<typeof receiptSchema>;
export const rotateWatchlistCard = createServerFn({ method: "POST" })
  .inputValidator((data) => actionSchema.parse(data))
  .handler(({ data }) => applyCardRotation(data));
export const undoWatchlistCard = createServerFn({ method: "POST" })
  .inputValidator((data) => receiptSchema.parse(data))
  .handler(({ data }) => undoCardRotation(data));
