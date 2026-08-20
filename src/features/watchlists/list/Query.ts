import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { listWatchlistSummaries } from "./Query.server";

export type { WatchlistListOrder, WatchlistSummary } from "./Query.server";

const watchlistListSchema = z.object({
  orderBy: z.enum(["createdAt", "lastWatched", "lastAdded"]).optional().default("createdAt"),
  order: z.enum(["asc", "desc"]).optional().default("desc"),
});

export type WatchlistListFilters = z.input<typeof watchlistListSchema>;

function normalizeWatchlistListFilters(filters: WatchlistListFilters = {}) {
  return watchlistListSchema.parse(filters);
}

export function watchlistListQueryKey(filters: WatchlistListFilters = {}) {
  const normalized = normalizeWatchlistListFilters(filters);

  return ["watchlists", "list", normalized] as const;
}

export const getWatchlistList = createServerFn()
  .inputValidator((data) => normalizeWatchlistListFilters(data || {}))
  .handler(async ({ data }) => {
    return listWatchlistSummaries(data);
  });
