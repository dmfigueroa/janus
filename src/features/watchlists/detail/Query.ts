import { infiniteQueryOptions, type QueryKey } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { WatchlistItem } from "@/db/Schema";
import type { WatchlistSummary } from "../list/Query";
import { getWatchlistDetail } from "./Query.server";

export type WatchlistDetailPage = {
  watchlist: WatchlistSummary;
  items: WatchlistItem[];
  nextCursor?: number;
};

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

export function readFiltersFromDetailQueryKey(queryKey: QueryKey) {
  const filters = queryKey[3];

  if (!isFilterRecord(filters)) {
    return null;
  }

  return filters as Partial<WatchlistDetailQueryKeyFilters>;
}

function isFilterRecord(value: unknown): value is Record<string, unknown> {
  if (value === null) {
    return false;
  }
  if (typeof value !== "object") {
    return false;
  }
  return !Array.isArray(value);
}

export function normalizeFiltersFromDetailQueryKey(queryKey: QueryKey, watchlistId: number) {
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

export { optimisticallyToggleWatchedItem, restoreWatchlistDetailSnapshot } from "./Cache";
