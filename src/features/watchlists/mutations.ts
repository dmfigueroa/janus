import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { UnifiedMediaSchema } from "@/server/media";

const createWatchlistSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

export type CreateWatchlistInput = z.infer<typeof createWatchlistSchema>;

const deleteWatchlistSchema = z.object({
  id: z.number(),
});

export type DeleteWatchlistInput = z.infer<typeof deleteWatchlistSchema>;

const mergeWatchlistsSchema = z
  .object({
    targetWatchlistId: z.number().optional(),
    sourceWatchlistIds: z
      .array(z.number())
      .min(1, "At least one source watchlist must be selected"),
    newWatchlistName: z.string().optional(),
  })
  .refine((data) => data.targetWatchlistId || data.newWatchlistName, {
    message: "Either targetWatchlistId or newWatchlistName must be provided",
  });

export type MergeWatchlistsInput = z.infer<typeof mergeWatchlistsSchema>;

const addToWatchlistSchema = z.object({
  watchlistId: z.number(),
  media: UnifiedMediaSchema,
});

export type AddToWatchlistInput = z.infer<typeof addToWatchlistSchema>;

export const createWatchlist = createServerFn({ method: "POST" })
  .inputValidator((data) => createWatchlistSchema.parse(data))
  .handler(async ({ data }) => {
    const { WatchlistsWrite } = await import("./write.server");
    return WatchlistsWrite.create(data);
  });

export const deleteWatchlist = createServerFn({ method: "POST" })
  .inputValidator((data) => deleteWatchlistSchema.parse(data))
  .handler(async ({ data }) => {
    const { WatchlistsWrite } = await import("./write.server");
    return WatchlistsWrite.delete(data);
  });

export const mergeWatchlists = createServerFn({ method: "POST" })
  .inputValidator((data) => mergeWatchlistsSchema.parse(data))
  .handler(async ({ data }) => {
    const { WatchlistsWrite } = await import("./write.server");
    return WatchlistsWrite.merge(data);
  });

export const addToWatchlist = createServerFn({ method: "POST" })
  .inputValidator((data) => addToWatchlistSchema.parse(data))
  .handler(async ({ data }) => {
    const { WatchlistsWrite } = await import("./write.server");
    return WatchlistsWrite.add(data);
  });
