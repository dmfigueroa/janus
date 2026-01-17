import { getWatchlistById } from "@/server/watchlists";
import { createFileRoute } from "@tanstack/react-router";
import { WatchlistHeader } from "@/components/watchlist/WatchlistHeader";
import { WatchlistTimeline } from "@/components/watchlist/WatchlistTimeline";
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/watchlists/$watchlistId")({
  loader: async ({ params: { watchlistId } }) => {
    return await getWatchlistById({
      data: { id: parseInt(watchlistId), page: 1, limit: 50 },
    });
  },
  component: WatchlistDetail,
});

function WatchlistDetail() {
  const initialData = Route.useLoaderData();
  const watchlistId = initialData.watchlist.id;
  const [showUnwatchedOnly, setShowUnwatchedOnly] = useState(true);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["watchlist", watchlistId, "items"],
    queryFn: async ({ pageParam }) => {
      return getWatchlistById({ data: { id: watchlistId, page: pageParam, limit: 50 } });
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialData: {
      pages: [initialData],
      pageParams: [1],
    },
  });

  const allItems = data?.pages.flatMap((page) => page.items) || [];
  // Use stats from the latest fetched page as they are recalculated on every request
  const latestWatchlist = data?.pages[data.pages.length - 1]?.watchlist || initialData.watchlist;

  const totalItems = latestWatchlist.stats.totalItems;
  const watchedItems = latestWatchlist.stats.watchedItems;

  const displayedItems = showUnwatchedOnly ? allItems.filter((i) => !i.isWatched) : allItems;

  return (
    <div className="container mx-auto min-h-screen max-w-3xl px-4 py-6 md:px-8 pb-32">
      <WatchlistHeader
        watchlist={latestWatchlist}
        totalItems={totalItems}
        watchedItems={watchedItems}
        showUnwatchedOnly={showUnwatchedOnly}
        onToggleFilter={() => setShowUnwatchedOnly((prev) => !prev)}
      />

      <div className="mt-8">
        <WatchlistTimeline
          items={displayedItems}
          hasMore={hasNextPage}
          isLoadingMore={isFetchingNextPage}
          onLoadMore={fetchNextPage}
        />
      </div>
    </div>
  );
}
