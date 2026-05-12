import { useEffect, useState, useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { WatchlistTimeline } from "@/components/watchlist/WatchlistTimeline";
import { WatchlistHeader } from "@/features/watchlists/components/watchlist-header";
import {
  getWatchlistDetailPage,
  watchlistDetailInfiniteQueryOptions,
  type WatchlistDetailQueryData,
} from "@/features/watchlists/detail/query";
import { useItemOrderModeMutation } from "@/features/watchlists/detail/use-item-order-mode-mutation";
import { useReorderWatchlistItemsMutation } from "@/features/watchlists/detail/use-reorder-watchlist-items-mutation";
import type { WatchlistItemOrderMode } from "@/features/watchlists/order";

interface WatchlistDetailScreenProps {
  initialData: WatchlistDetailQueryData;
}

export function WatchlistDetailScreen({ initialData }: WatchlistDetailScreenProps) {
  const watchlistId = initialData.watchlist.id;
  const [showUnwatchedOnly, setShowUnwatchedOnly] = useState(true);
  const [itemOrderMode, setItemOrderMode] = useState<WatchlistItemOrderMode>(
    initialData.watchlist.itemOrderMode,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");

  const getWatchlistDetailPageFn = useServerFn(getWatchlistDetailPage);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filters = useMemo(
    () => ({
      watchlistId,
      itemOrderMode,
      query: debouncedSearchQuery || undefined,
      unwatchedOnly: showUnwatchedOnly,
    }),
    [watchlistId, itemOrderMode, debouncedSearchQuery, showUnwatchedOnly],
  );

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...watchlistDetailInfiniteQueryOptions(filters),
    queryFn: async ({ pageParam }) => {
      const detail = await getWatchlistDetailPageFn({
        data: { ...filters, cursor: pageParam },
      });

      if (!detail) {
        throw new Error("Watchlist not found");
      }

      return detail;
    },
  });

  const updateItemOrderModeMutation = useItemOrderModeMutation({
    initialItemOrderMode: initialData.watchlist.itemOrderMode,
    watchlistId,
    onOptimisticChange: setItemOrderMode,
    onRollback: setItemOrderMode,
  });
  const reorderItemsMutation = useReorderWatchlistItemsMutation({ watchlistId });

  const allItems = data?.pages.flatMap((page) => page.items) || [];
  const latestWatchlist = data?.pages[data.pages.length - 1]?.watchlist || initialData.watchlist;
  const canReorderItems =
    itemOrderMode === "custom" &&
    !showUnwatchedOnly &&
    searchQuery.trim().length === 0 &&
    debouncedSearchQuery.length === 0 &&
    hasNextPage === false &&
    allItems.length > 1 &&
    !reorderItemsMutation.isPending;

  const totalItems = latestWatchlist.stats.totalItems;
  const watchedItems = latestWatchlist.stats.watchedItems;

  return (
    <div className="container mx-auto min-h-screen max-w-3xl px-4 py-6 md:px-8 pb-32">
      <WatchlistHeader
        watchlist={latestWatchlist}
        totalItems={totalItems}
        watchedItems={watchedItems}
        showUnwatchedOnly={showUnwatchedOnly}
        onFilterChange={setShowUnwatchedOnly}
        itemOrderMode={itemOrderMode}
        onItemOrderModeChange={(nextItemOrderMode) => {
          if (nextItemOrderMode === itemOrderMode) {
            return;
          }

          updateItemOrderModeMutation.mutate({
            previousItemOrderMode: itemOrderMode,
            nextItemOrderMode,
          });
        }}
        isUpdatingItemOrderMode={updateItemOrderModeMutation.isPending}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <div className="mt-8">
        <WatchlistTimeline
          items={allItems}
          hasMore={hasNextPage}
          isLoadingMore={isFetchingNextPage}
          onLoadMore={fetchNextPage}
          canReorder={canReorderItems}
          onReorder={(itemIds) => reorderItemsMutation.mutate(itemIds)}
        />
      </div>
    </div>
  );
}
