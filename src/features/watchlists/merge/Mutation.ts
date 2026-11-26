import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mergeWatchlistsMutation } from "./Mutation.server";

const watchlistIdSchema = z.number().int().positive();

export const mergeTargetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("existing"),
    watchlistId: watchlistIdSchema,
  }),
  z.object({
    kind: z.literal("new"),
    name: z.string().trim().min(1, "Name is required"),
  }),
]);

export const mergeWatchlistsSchema = z.object({
  sourceWatchlistIds: z
    .array(watchlistIdSchema)
    .min(1, "At least one source watchlist must be selected"),
  target: mergeTargetSchema,
});

export type MergeTarget = z.infer<typeof mergeTargetSchema>;
export type MergeWatchlistsInput = z.infer<typeof mergeWatchlistsSchema>;

export const mergeWatchlists = createServerFn({ method: "POST" })
  .inputValidator((data) => mergeWatchlistsSchema.parse(data))
  .handler(async ({ data }) => {
    return mergeWatchlistsMutation(data);
  });
