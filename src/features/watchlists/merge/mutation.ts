import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const mergeWatchlistsSchema = z
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

export const mergeWatchlists = createServerFn({ method: "POST" })
  .inputValidator((data) => mergeWatchlistsSchema.parse(data))
  .handler(async ({ data }) => {
    const { WatchlistsWrite } = await import("../write.server");
    return WatchlistsWrite.merge(data);
  });
