import { z } from "zod";
import { addToWatchlistInsertionPositionSchema } from "./Mutation";

type InsertionPositionInput = z.infer<typeof addToWatchlistInsertionPositionSchema>;

export type AnchorRefinementShape = {
  insertionPosition?: InsertionPositionInput;
  referenceItemId?: number;
};

export function anchorInsertionRefinement(
  value: AnchorRefinementShape,
  context: z.RefinementCtx,
): void {
  if (isAnchorPosition(value.insertionPosition)) {
    requireReferenceItemId(value, context);
    return;
  }
  forbidReferenceItemId(value, context);
}

function isAnchorPosition(position: InsertionPositionInput | undefined): boolean {
  return position === "before" || position === "after";
}

function requireReferenceItemId(value: AnchorRefinementShape, context: z.RefinementCtx): void {
  if (value.referenceItemId !== undefined) {
    return;
  }
  context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["referenceItemId"],
    message: "referenceItemId is required when insertionPosition is before or after.",
  });
}

function forbidReferenceItemId(value: AnchorRefinementShape, context: z.RefinementCtx): void {
  if (value.referenceItemId === undefined) {
    return;
  }
  context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["referenceItemId"],
    message: "referenceItemId may only be set when insertionPosition is before or after.",
  });
}
