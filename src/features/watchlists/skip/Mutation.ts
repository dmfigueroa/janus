import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { skipWatchlistMutation } from "../lifecycle/WatchlistLifecycle.server";

export const skipWatchlistSchema = z.object({
  watchlistId: z.number().int().positive(),
});

export type SkipWatchlistInput = z.infer<typeof skipWatchlistSchema>;

export const skipWatchlist = createServerFn({ method: "POST" })
  .inputValidator((data) => skipWatchlistSchema.parse(data))
  .handler(async ({ data }) => {
    return skipWatchlistMutation(data);
  });
