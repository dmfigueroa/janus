import { z } from "zod";

export const moveInsertionPositionSchema = z.enum([
  "beginning",
  "end",
  "release-adjacent",
  "before",
  "after",
]);

type AnchorShape = {
  position?: z.infer<typeof moveInsertionPositionSchema>;
  referenceItemId?: number;
};

function isAnchorPosition(position: AnchorShape["position"]): boolean {
  return position === "before" || position === "after";
}

function requireReferenceItemId(value: AnchorShape, ctx: z.RefinementCtx): void {
  if (value.referenceItemId !== undefined) {
    return;
  }
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["referenceItemId"],
    message: "referenceItemId is required when position is before or after.",
  });
}

function forbidReferenceItemId(value: AnchorShape, ctx: z.RefinementCtx): void {
  if (value.referenceItemId === undefined) {
    return;
  }
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["referenceItemId"],
    message: "referenceItemId may only be set when position is before or after.",
  });
}

export function anchorReferenceRefinement(value: AnchorShape, ctx: z.RefinementCtx): void {
  if (isAnchorPosition(value.position)) {
    requireReferenceItemId(value, ctx);
    return;
  }
  forbidReferenceItemId(value, ctx);
}

export const moveItemToWatchlistSchema = z
  .object({
    itemId: z.number(),
    destinationWatchlistId: z.number(),
    position: moveInsertionPositionSchema.optional(),
    referenceItemId: z.number().int().positive().optional(),
  })
  .superRefine(anchorReferenceRefinement);

export type MoveItemToWatchlistInput = z.infer<typeof moveItemToWatchlistSchema>;

export const moveParentToWatchlistSchema = z
  .object({
    itemId: z.number(),
    destinationWatchlistId: z.number(),
    position: moveInsertionPositionSchema.optional(),
    referenceItemId: z.number().int().positive().optional(),
  })
  .superRefine(anchorReferenceRefinement);

export type MoveParentToWatchlistInput = z.infer<typeof moveParentToWatchlistSchema>;
