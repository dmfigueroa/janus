"use server";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Watchlist, type WatchlistDetailPage } from "../models/watchlist";

const mergeWatchlistSchema = z
  .object({
    targetWatchlistId: z.number().optional(),
    sourceWatchlistIds: z.array(z.number()),
    newWatchlistName: z.string().optional(),
  })
  .refine((data) => data.targetWatchlistId || data.newWatchlistName, {
    message: "Either targetWatchlistId or newWatchlistName must be provided",
  });

export const getWatchlistSummaries = createServerFn()
  .inputValidator((data) =>
    z
      .object({
        orderBy: z.enum(["createdAt", "lastWatched", "lastAdded"]).optional().default("createdAt"),
        order: z.enum(["asc", "desc"]).optional().default("desc"),
      })
      .parse(data || {}),
  )
  .handler(async ({ data }) => Watchlist.listSummaries(data));

export type GetWatchlistDetailResult = WatchlistDetailPage | null;

export const getWatchlistDetail = createServerFn()
  .inputValidator((data) =>
    z
      .object({
        watchlistId: z.coerce.number(),
        cursor: z.number().optional().default(1),
        pageSize: z.number().optional().default(50),
        query: z.string().optional(),
        unwatchedOnly: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => Watchlist.getDetail(data));

export const mergeWatchlists = createServerFn({ method: "POST" })
  .inputValidator((data) => mergeWatchlistSchema.parse(data))
  .handler(async ({ data }) => {
    const { targetId } = await Watchlist.merge(data);
    return { success: true, targetId };
  });
