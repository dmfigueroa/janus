import { infiniteQueryOptions, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { WatchlistItem } from "@/db/schema";
import type { WatchlistDetailPage } from "@/models/watchlist";

const watchlistListSchema = z.object({
  orderBy: z.enum(["createdAt", "lastWatched", "lastAdded"]).optional().default("createdAt"),
  order: z.enum(["asc", "desc"]).optional().default("desc"),
});

const watchlistDetailFiltersSchema = z.object({
  watchlistId: z.coerce.number(),
  pageSize: z.number().optional().default(50),
  query: z.string().optional(),
  unwatchedOnly: z.boolean().optional().default(false),
});

const watchlistDetailPageSchema = watchlistDetailFiltersSchema.extend({
  cursor: z.number().optional().default(1),
});

export type WatchlistDetailQueryFilters = z.input<typeof watchlistDetailFiltersSchema>;
export type WatchlistDetailQueryData = WatchlistDetailPage;

function normalizeWatchlistDetailFilters(filters: WatchlistDetailQueryFilters) {
  return watchlistDetailFiltersSchema.parse(filters);
}

function toWatchlistDetailInfiniteData(
  page: WatchlistDetailQueryData,
): InfiniteData<WatchlistDetailQueryData, number> {
  return {
    pages: [page],
    pageParams: [1],
  };
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

export const getWatchlistList = createServerFn()
  .inputValidator((data) => watchlistListSchema.parse(data || {}))
  .handler(async ({ data }) => {
    const { WatchlistsRead } = await import("./read.server");
    return WatchlistsRead.listScreen(data);
  });

export const getWatchlistDetailPage = createServerFn()
  .inputValidator((data) => watchlistDetailPageSchema.parse(data))
  .handler(async ({ data }) => {
    const { WatchlistsRead } = await import("./read.server");
    return WatchlistsRead.detailScreen(data);
  });

export async function loadWatchlistDetailRoute({
  queryClient,
  filters,
}: {
  queryClient: QueryClient;
  filters: WatchlistDetailQueryFilters;
}) {
  const normalized = normalizeWatchlistDetailFilters(filters);
  const { WatchlistsRead } = await import("./read.server");
  const detail = await WatchlistsRead.detailScreen(normalized);

  if (!detail) {
    return null;
  }

  queryClient.setQueryData(
    watchlistDetailQueryKey(normalized),
    toWatchlistDetailInfiniteData(detail),
  );

  return detail;
}

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

export function updateWatchlistDetailPagesAfterToggle({
  data,
  itemId,
  nextIsWatched,
}: {
  data: InfiniteData<WatchlistDetailPage, number> | undefined;
  itemId: WatchlistItem["id"];
  nextIsWatched: boolean;
}) {
  if (!data) {
    return data;
  }

  return {
    ...data,
    pages: data.pages.map((page) => {
      const watchedItems = page.watchlist.stats.watchedItems + (nextIsWatched ? 1 : -1);
      const totalItems = page.watchlist.stats.totalItems;

      return {
        ...page,
        watchlist: {
          ...page.watchlist,
          stats: {
            ...page.watchlist.stats,
            watchedItems,
            progress: totalItems > 0 ? Math.round((watchedItems / totalItems) * 100) : 0,
          },
        },
        items: page.items.map((item) =>
          item.id === itemId ? { ...item, isWatched: nextIsWatched } : item,
        ),
      };
    }),
  };
}
