import { infiniteQueryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { WatchlistDetailPage } from "@/models/watchlist";
import { getWatchlistDetail } from "./query.server";

const watchlistDetailFiltersSchema = z.object({
  watchlistId: z.coerce.number(),
  pageSize: z.number().optional().default(50),
  query: z.string().optional(),
  unwatchedOnly: z.boolean().optional().default(false),
  itemOrderMode: z.enum(["release", "custom"]).optional().default("release"),
});

export type WatchlistDetailQueryFilters = z.input<typeof watchlistDetailFiltersSchema>;
export type WatchlistDetailQueryData = WatchlistDetailPage;

const watchlistDetailPageSchema = watchlistDetailFiltersSchema.extend({
  cursor: z.number().optional().default(1),
});

function normalizeWatchlistDetailFilters(filters: WatchlistDetailQueryFilters) {
  return watchlistDetailFiltersSchema.parse(filters);
}

export function watchlistDetailQueryFamily(watchlistId: number) {
  return ["watchlists", "detail", watchlistId] as const;
}

export function watchlistDetailQueryKey(filters: WatchlistDetailQueryFilters) {
  const normalized = normalizeWatchlistDetailFilters(filters);

  return [
    ...watchlistDetailQueryFamily(normalized.watchlistId),
    {
      itemOrderMode: normalized.itemOrderMode,
      pageSize: normalized.pageSize,
      query: normalized.query ?? "",
      unwatchedOnly: normalized.unwatchedOnly,
    },
  ] as const;
}

export type WatchlistDetailQueryKeyFilters = ReturnType<typeof watchlistDetailQueryKey>[3];

export function readFiltersFromDetailQueryKey(queryKey: any) {
  const filters = queryKey[3];

  if (!filters || typeof filters !== "object" || Array.isArray(filters)) {
    return null;
  }

  return filters as Partial<WatchlistDetailQueryKeyFilters>;
}

export function normalizeFiltersFromDetailQueryKey(queryKey: any, watchlistId: number) {
  const filters = readFiltersFromDetailQueryKey(queryKey);

  if (!filters) {
    return null;
  }

  return normalizeWatchlistDetailFilters({
    watchlistId,
    pageSize: filters.pageSize,
    query: filters.query,
    unwatchedOnly: filters.unwatchedOnly,
    itemOrderMode: filters.itemOrderMode,
  });
}

export const getWatchlistDetailPage = createServerFn()
  .inputValidator((data) => watchlistDetailPageSchema.parse(data))
  .handler(async ({ data }) => {
    return getWatchlistDetail(data);
  });

export function watchlistDetailInfiniteQueryOptions(filters: WatchlistDetailQueryFilters) {
  const normalized = normalizeWatchlistDetailFilters(filters);

  return infiniteQueryOptions({
    queryKey: watchlistDetailQueryKey(normalized),
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const detail = await getWatchlistDetailPage({
        data: { ...normalized, cursor: pageParam },
      });

      if (!detail) {
        throw new Error("Watchlist not found");
      }

      return detail;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

export { optimisticallyToggleWatchedItem, restoreWatchlistDetailSnapshot } from "./cache";
