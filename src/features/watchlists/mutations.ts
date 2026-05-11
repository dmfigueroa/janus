import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { UnifiedMediaSchema } from "@/server/media";
import type { WatchlistItemOrderMode } from "@/features/watchlists/order";

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
export type WatchlistMedia = AddToWatchlistInput["media"];
export type GenericMedia = Omit<WatchlistMedia, "mediaType"> & {
  mediaType: Exclude<WatchlistMedia["mediaType"], "tv">;
};

const toggleWatchedSchema = z.object({
  itemId: z.number(),
  isWatched: z.boolean(),
});

export type ToggleWatchedInput = z.infer<typeof toggleWatchedSchema>;

const updateWatchlistItemOrderModeSchema = z.object({
  watchlistId: z.number(),
  itemOrderMode: z.enum(["release", "custom"]),
});

export type UpdateWatchlistItemOrderModeInput = {
  watchlistId: number;
  itemOrderMode: WatchlistItemOrderMode;
};

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

export const toggleWatched = createServerFn({ method: "POST" })
  .inputValidator((data) => toggleWatchedSchema.parse(data))
  .handler(async ({ data }) => {
    const { WatchlistsWrite } = await import("./write.server");
    return WatchlistsWrite.toggleWatched(data);
  });

export const updateWatchlistItemOrderMode = createServerFn({ method: "POST" })
  .inputValidator((data) => updateWatchlistItemOrderModeSchema.parse(data))
  .handler(async ({ data }) => {
    const { WatchlistsWrite } = await import("./write.server");
    return WatchlistsWrite.updateItemOrderMode(data);
  });
