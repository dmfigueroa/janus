import { infiniteQueryOptions, type InfiniteData } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { WatchlistItem } from "@/db/schema";
import type { WatchlistDetailPage } from "@/models/watchlist";
import { calculateWatchlistProgress } from "@/features/watchlists/progress";

const watchlistDetailFiltersSchema = z.object({
  watchlistId: z.coerce.number(),
  pageSize: z.number().optional().default(50),
  query: z.string().optional(),
  unwatchedOnly: z.boolean().optional().default(false),
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
      pageSize: normalized.pageSize,
      query: normalized.query ?? "",
      unwatchedOnly: normalized.unwatchedOnly,
    },
  ] as const;
}

export const getWatchlistDetailPage = createServerFn()
  .inputValidator((data) => watchlistDetailPageSchema.parse(data))
  .handler(async ({ data }) => {
    const { WatchlistsRead } = await import("../read.server");
    return WatchlistsRead.detailScreen(data);
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
            progress: calculateWatchlistProgress({ totalItems, watchedItems }),
          },
        },
        items: page.items.map((item) =>
          item.id === itemId ? { ...item, isWatched: nextIsWatched } : item,
        ),
      };
    }),
  };
}
