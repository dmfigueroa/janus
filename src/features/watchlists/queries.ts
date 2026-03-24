import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { WatchlistsRead } from "./read.server";

const watchlistListSchema = z.object({
  orderBy: z.enum(["createdAt", "lastWatched", "lastAdded"]).optional().default("createdAt"),
  order: z.enum(["asc", "desc"]).optional().default("desc"),
});

export const getWatchlistList = createServerFn()
  .inputValidator((data) => watchlistListSchema.parse(data || {}))
  .handler(async ({ data }) => WatchlistsRead.listScreen(data));
