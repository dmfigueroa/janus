import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { UnifiedMediaSchema } from "@/server/media";

export const addToWatchlistSchema = z.object({
  watchlistId: z.number(),
  media: UnifiedMediaSchema,
});

export type AddToWatchlistInput = z.infer<typeof addToWatchlistSchema>;
export type WatchlistMedia = AddToWatchlistInput["media"];
export type GenericMedia = Omit<WatchlistMedia, "mediaType"> & {
  mediaType: Exclude<WatchlistMedia["mediaType"], "tv">;
};

export const addToWatchlist = createServerFn({ method: "POST" })
  .inputValidator((data) => addToWatchlistSchema.parse(data))
  .handler(async ({ data }) => {
    const { WatchlistsWrite } = await import("../write.server");
    return WatchlistsWrite.add(data);
  });
