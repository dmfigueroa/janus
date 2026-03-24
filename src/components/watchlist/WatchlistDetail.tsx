"use client";

import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  watchlistDetailInfiniteQueryOptions,
  type WatchlistDetailQueryData,
} from "@/features/watchlists/queries";
import { WatchlistHeader } from "@/components/watchlist/WatchlistHeader";
import { WatchlistTimeline } from "@/components/watchlist/WatchlistTimeline";

interface WatchlistDetailProps {
  initialData: WatchlistDetailQueryData;
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

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery(
    watchlistDetailInfiniteQueryOptions({
      watchlistId,
      query: debouncedSearchQuery || undefined,
      unwatchedOnly: showUnwatchedOnly,
    }),
  );

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
