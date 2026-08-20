import { useEffect, useState, useMemo } from "react";
import { useInfiniteQuery, useIsMutating, type InfiniteData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { WatchlistHeader } from "@/features/watchlists/components/WatchlistHeader";
import { WatchlistTimeline } from "@/features/watchlists/components/WatchlistTimeline";
import {
  getWatchlistDetailPage,
  watchlistDetailInfiniteQueryOptions,
  type WatchlistDetailQueryData,
} from "@/features/watchlists/detail/Query";
import { useReorderWatchlistItemsMutation } from "@/features/watchlists/detail/useReorderWatchlistItemsMutation";
import { canReorderWatchlistItems } from "@/features/watchlists/detail/Reorder";

interface WatchlistDetailScreenProps {
  initialData: WatchlistDetailQueryData;
}

export function WatchlistDetailScreen({ initialData }: WatchlistDetailScreenProps) {
  const watchlistId = initialData.watchlist.id;
  const [showUnwatchedOnly, setShowUnwatchedOnly] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");

  const getWatchlistDetailPageFn = useServerFn(getWatchlistDetailPage);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const normalizedSearchQuery = normalizeSearchQuery(debouncedSearchQuery);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...watchlistDetailInfiniteQueryOptions({
      watchlistId,
      query: normalizedSearchQuery,
      unwatchedOnly: showUnwatchedOnly,
    }),
    queryFn: async ({ pageParam }) => {
      const detail = await getWatchlistDetailPageFn({
        data: {
          watchlistId,
          query: normalizedSearchQuery,
          unwatchedOnly: showUnwatchedOnly,
          cursor: pageParam,
        },
      });

      if (!detail) {
        throw new Error("Watchlist not found");
      }

      return detail;
    },
  });

  const { allItems, latestWatchlist } = getCurrentDetailData(data, initialData.watchlist);
  const latestItemOrderMode = latestWatchlist.itemOrderMode;

  const reorderItemsMutation = useReorderWatchlistItemsMutation({
    watchlistId,
    activeFilters: {
      watchlistId,
      itemOrderMode: latestItemOrderMode,
      query: normalizedSearchQuery,
      unwatchedOnly: showUnwatchedOnly,
    },
  });
  const isWatchedTogglePending =
    useIsMutating({ mutationKey: ["watchlists", "toggle-watched", watchlistId] }) > 0;
  const isReorderPending = reorderItemsMutation.isPending;

  const canReorderItems = canReorderWatchlistItems({
    itemOrderMode: latestItemOrderMode,
    itemCount: allItems.length,
    isReorderPending,
    isWatchedTogglePending,
  });

  const totalItems = latestWatchlist.stats.totalItems;
  const watchedItems = latestWatchlist.stats.watchedItems;

  const activeFilters = useMemo(
    () => ({
      watchlistId,
      itemOrderMode: latestItemOrderMode,
      query: normalizedSearchQuery,
      unwatchedOnly: showUnwatchedOnly,
    }),
    [watchlistId, latestItemOrderMode, normalizedSearchQuery, showUnwatchedOnly],
  );

  return (
    <div className="container mx-auto min-h-screen max-w-3xl px-4 py-6 md:px-8 pb-32">
      <WatchlistHeader
        watchlist={latestWatchlist}
        totalItems={totalItems}
        watchedItems={watchedItems}
        showUnwatchedOnly={showUnwatchedOnly}
        onFilterChange={setShowUnwatchedOnly}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        interactionDisabled={isReorderPending}
      />

      <div className="mt-8">
        <WatchlistTimeline
          items={allItems}
          activeFilters={activeFilters}
          itemOrderMode={latestItemOrderMode}
          hasMore={hasNextPage}
          isLoadingMore={isFetchingNextPage}
          onLoadMore={getLoadMoreHandler(isReorderPending, fetchNextPage)}
          canReorder={canReorderItems}
          interactionDisabled={isReorderPending}
          reorderFailed={reorderItemsMutation.isError}
          onReorder={async (intent) => {
            await reorderItemsMutation.mutateAsync(intent);
            toast.success("Order saved", { duration: 2000 });
          }}
        />
      </div>
    </div>
  );
}

function normalizeSearchQuery(searchQuery: string) {
  return searchQuery ? searchQuery : undefined;
}

function getCurrentDetailData(
  data: InfiniteData<WatchlistDetailQueryData> | undefined,
  initialWatchlist: WatchlistDetailQueryData["watchlist"],
) {
  if (!data) {
    return { allItems: [], latestWatchlist: initialWatchlist };
  }

  const latestPage = data.pages.at(-1);
  if (!latestPage) {
    return { allItems: [], latestWatchlist: initialWatchlist };
  }

  return {
    allItems: data.pages.flatMap((page) => page.items),
    latestWatchlist: latestPage.watchlist,
  };
}

function getLoadMoreHandler(isReorderPending: boolean, fetchNextPage: () => Promise<unknown>) {
  return isReorderPending ? undefined : fetchNextPage;
}
