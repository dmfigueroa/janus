import { z } from "zod";

export const watchlistSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  itemOrderMode: z.enum(["release", "custom"]),
});

export const batchResultSchema = z.object({
  index: z.number().int().nonnegative(),
  success: z.boolean(),
  code: z.string(),
  message: z.string(),
  watchlistId: z.number().optional(),
  watchlist: watchlistSchema.optional(),
});

const validationMessageOverrides: Record<string, string> = {
  "name:Required": "Name is required",
};

export function validationErrorResult(index: number, error: z.ZodError, watchlistId?: number) {
  return {
    index,
    success: false,
    code: "validation_error",
    message: validationMessage(error),
    watchlistId,
  };
}

export function validationMessage(error: z.ZodError) {
  const issue = error.issues[0]!;
  return validationMessageOverrides[`${issue.path[0]}:${issue.message}`] ?? issue.message;
}
