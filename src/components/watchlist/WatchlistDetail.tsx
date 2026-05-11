import { useEffect, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  invalidateWatchlistQueries,
  optimisticallyUpdateWatchlistItemOrderMode,
  rollbackWatchlistItemOrderMode,
  type WatchlistItemOrderMode,
  watchlistDetailInfiniteQueryOptions,
  type WatchlistDetailQueryData,
} from "@/features/watchlists/detail/query";
import { WatchlistHeader } from "@/components/watchlist/WatchlistHeader";
import { WatchlistTimeline } from "@/components/watchlist/WatchlistTimeline";
import { updateWatchlistItemOrderMode } from "@/features/watchlists/mutations";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

interface WatchlistDetailProps {
  initialData: WatchlistDetailQueryData;
}

export function WatchlistDetail({ initialData }: WatchlistDetailProps) {
  const watchlistId = initialData.watchlist.id;
  const queryClient = useQueryClient();
  const updateWatchlistItemOrderModeFn = useServerFn(updateWatchlistItemOrderMode);
  const [showUnwatchedOnly, setShowUnwatchedOnly] = useState(true);
  const [itemOrderMode, setItemOrderMode] = useState<WatchlistItemOrderMode>(
    initialData.watchlist.itemOrderMode,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery(
    watchlistDetailInfiniteQueryOptions({
      watchlistId,
      itemOrderMode,
      query: debouncedSearchQuery || undefined,
      unwatchedOnly: showUnwatchedOnly,
    }),
  );

  const updateItemOrderModeMutation = useMutation({
    mutationFn: async (nextItemOrderMode: WatchlistItemOrderMode) => {
      await updateWatchlistItemOrderModeFn({
        data: { watchlistId, itemOrderMode: nextItemOrderMode },
      });
    },
    onMutate: async (nextItemOrderMode) => {
      const previousItemOrderMode = itemOrderMode;
      const snapshot = await optimisticallyUpdateWatchlistItemOrderMode({
        queryClient,
        watchlistId,
        previousItemOrderMode,
        nextItemOrderMode,
      });

      setItemOrderMode(nextItemOrderMode);

      return { previousItemOrderMode, snapshot };
    },
    onError: (_err, _nextItemOrderMode, context) => {
      rollbackWatchlistItemOrderMode({
        queryClient,
        snapshot: context?.snapshot,
      });
      setItemOrderMode(context?.previousItemOrderMode ?? initialData.watchlist.itemOrderMode);
      toast.error("Failed to update item order");
    },
    onSettled: () => invalidateWatchlistQueries(queryClient),
  });

  const allItems = data?.pages.flatMap((page) => page.items) || [];
  const latestWatchlist = data?.pages[data.pages.length - 1]?.watchlist || initialData.watchlist;

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

          updateItemOrderModeMutation.mutate(nextItemOrderMode);
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
        />
      </div>
    </div>
  );
}
