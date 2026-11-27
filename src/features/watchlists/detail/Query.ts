import { infiniteQueryOptions, type QueryKey } from "@tanstack/react-query";
import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { WatchlistItem } from "@/db/Schema";
import type { WatchlistSummary } from "../list/Query";
import { getWatchlistDetail } from "./Query.server";

export const WATCHLIST_DETAIL_STALE_TIME_MS = 30_000;

export type WatchlistDetailPage = {
  watchlist: WatchlistSummary;
  items: WatchlistItem[];
  nextCursor?: number;
};

const watchlistDetailFiltersSchema = z.object({
  watchlistId: z.coerce.number().int().positive(),
  pageSize: z.number().optional().default(50),
  query: z.string().optional(),
  unwatchedOnly: z.boolean().optional().default(false),
});

export type WatchlistDetailQueryFilters = z.input<typeof watchlistDetailFiltersSchema>;
export type WatchlistDetailQueryData = WatchlistDetailPage;

const watchlistDetailPageSchema = watchlistDetailFiltersSchema.extend({
  cursor: z.number().optional().default(1),
});

export type WatchlistDetailPageInput = z.output<typeof watchlistDetailPageSchema>;

export type FetchWatchlistDetailPage = (input: {
  data: WatchlistDetailPageInput;
}) => Promise<WatchlistDetailPage | null>;

type NormalizedWatchlistDetailFilters = z.output<typeof watchlistDetailFiltersSchema>;

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
  });
}

export const getWatchlistDetailPage = createServerFn()
  .inputValidator((data) => watchlistDetailPageSchema.parse(data))
  .handler(async ({ data }) => {
    return getWatchlistDetail(data);
  });

async function loadWatchlistDetailPage(
  fetchPage: FetchWatchlistDetailPage,
  normalized: NormalizedWatchlistDetailFilters,
  cursor: number,
) {
  const detail = await fetchPage({
    data: { ...normalized, cursor },
  });

  if (!detail) {
    throw notFound();
  }

  return detail;
}

export function watchlistDetailInfiniteQueryOptions(
  filters: WatchlistDetailQueryFilters,
  fetchPage: FetchWatchlistDetailPage = getWatchlistDetailPage,
) {
  const normalized = normalizeWatchlistDetailFilters(filters);

  return infiniteQueryOptions({
    queryKey: watchlistDetailQueryKey(normalized),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => loadWatchlistDetailPage(fetchPage, normalized, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: WATCHLIST_DETAIL_STALE_TIME_MS,
  });
}
