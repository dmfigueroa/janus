"use client";

import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { getWatchlistById, type GetWatchlistByIdResult } from "@/server/watchlists";
import { WatchlistHeader } from "@/components/watchlist/WatchlistHeader";
import { WatchlistTimeline } from "@/components/watchlist/WatchlistTimeline";

interface WatchlistDetailProps {
  initialData: GetWatchlistByIdResult;
}

export function buildWatchlistQueryInput(params: {
  watchlistId: number;
  page: number;
  query: string;
  showUnwatchedOnly: boolean;
}) {
  const { watchlistId, page, query, showUnwatchedOnly } = params;
  return {
    data: {
      id: watchlistId,
      page,
      limit: 50,
      query: query || undefined,
      isWatched: showUnwatchedOnly ? false : undefined,
    },
  };
}

export function WatchlistDetail({ initialData }: WatchlistDetailProps) {
  const watchlistId = initialData.watchlist.id;
  const [showUnwatchedOnly, setShowUnwatchedOnly] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["watchlist", watchlistId, "items", debouncedSearchQuery, showUnwatchedOnly],
    queryFn: async ({ pageParam }) => {
      return getWatchlistById(
        buildWatchlistQueryInput({
          watchlistId,
          page: pageParam,
          query: debouncedSearchQuery,
          showUnwatchedOnly,
        }),
      );
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialData:
      // Only use initialData if there is no search query AND we are not filtering by unwatched only
      // (because initialData is unfiltered)
      debouncedSearchQuery === "" && !showUnwatchedOnly
        ? {
            pages: [initialData],
            pageParams: [1],
          }
        : undefined,
  });

  const allItems = data?.pages.flatMap((page) => page.items) || [];
  // Use stats from the latest fetched page as they are recalculated on every request
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
        onToggleFilter={() => setShowUnwatchedOnly((prev) => !prev)}
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
