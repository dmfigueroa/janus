import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const watchlistListSchema = z.object({
  orderBy: z.enum(["createdAt", "lastWatched", "lastAdded"]).optional().default("createdAt"),
  order: z.enum(["asc", "desc"]).optional().default("desc"),
});

export const getWatchlistList = createServerFn()
  .inputValidator((data) => watchlistListSchema.parse(data || {}))
  .handler(async ({ data }) => {
    const { WatchlistsRead } = await import("./read.server");
    return WatchlistsRead.listScreen(data);
  });
