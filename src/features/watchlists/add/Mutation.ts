import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { UnifiedMediaSchema } from "@/server/Media";
import { addToWatchlistMutation } from "./Mutation.server";
import { anchorInsertionRefinement } from "./InsertionRefinement";

export const addToWatchlistInsertionPositionSchema = z.enum([
  "beginning",
  "end",
  "release-adjacent",
  "before",
  "after",
]);

export const addToWatchlistSchema = z
  .object({
    watchlistId: z.number(),
    media: UnifiedMediaSchema,
    insertionPosition: addToWatchlistInsertionPositionSchema.optional(),
    referenceItemId: z.number().int().positive().optional(),
  })
  .superRefine(anchorInsertionRefinement);

export type AddToWatchlistInput = z.infer<typeof addToWatchlistSchema>;
export type AddToWatchlistInsertionPosition = z.infer<typeof addToWatchlistInsertionPositionSchema>;
export type WatchlistMedia = AddToWatchlistInput["media"];
export type GenericMedia = Omit<WatchlistMedia, "mediaType"> & {
  mediaType: Exclude<WatchlistMedia["mediaType"], "tv">;
};

export const addToWatchlist = createServerFn({ method: "POST" })
  .inputValidator((data) => addToWatchlistSchema.parse(data))
  .handler(async ({ data }) => {
    return addToWatchlistMutation(data);
  });
