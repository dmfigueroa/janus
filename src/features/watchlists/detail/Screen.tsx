import { useEffect, useState, useMemo } from "react";
import { Box, Container } from "@chakra-ui/react";
import { useInfiniteQuery, useIsMutating, type InfiniteData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { DeleteWatchlistDialog } from "@/features/watchlists/components/DeleteWatchlistDialog";
import { WatchlistHeader } from "@/features/watchlists/components/WatchlistHeader";
import { WatchlistTimeline } from "@/features/watchlists/components/WatchlistTimeline";
import {
  getWatchlistDetailPage,
  watchlistDetailInfiniteQueryOptions,
  type WatchlistDetailQueryData,
} from "@/features/watchlists/detail/Query";
import { useDeleteWatchlistDetail } from "@/features/watchlists/detail/useDeleteWatchlistDetail";
import { useReorderWatchlistItemsMutation } from "@/features/watchlists/detail/useReorderWatchlistItemsMutation";
import { canReorderWatchlistItems } from "@/features/watchlists/detail/Reorder";
import { useToggleWatchlistPause } from "@/features/watchlists/pause/useToggleWatchlistPause";

interface WatchlistDetailScreenProps {
  initialData: WatchlistDetailQueryData;
}

export function WatchlistDetailScreen({ initialData }: WatchlistDetailScreenProps) {
  const watchlistId = initialData.watchlist.id;
  const { deleteOpen, setDeleteOpen, deleting, handleDelete } =
    useDeleteWatchlistDetail(watchlistId);
  const [showUnwatchedOnly, setShowUnwatchedOnly] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedSearchQuery(searchQuery);

  const getWatchlistDetailPageFn = useServerFn(getWatchlistDetailPage);

  const normalizedSearchQuery = normalizeSearchQuery(debouncedSearchQuery);

  const itemOrderMode = initialData.watchlist.itemOrderMode;
  const activeFilters = useMemo(
    () => ({
      watchlistId,
      itemOrderMode,
      query: normalizedSearchQuery,
      unwatchedOnly: showUnwatchedOnly,
    }),
    [watchlistId, itemOrderMode, normalizedSearchQuery, showUnwatchedOnly],
  );

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...watchlistDetailInfiniteQueryOptions(activeFilters),
    queryFn: async ({ pageParam }) => {
      const detail = await getWatchlistDetailPageFn({
        data: {
          ...activeFilters,
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
    activeFilters,
  });
  const isWatchedTogglePending =
    useIsMutating({ mutationKey: ["watchlists", "toggle-watched", watchlistId] }) > 0;
  const isReorderPending = reorderItemsMutation.isPending;
  const togglePauseMutation = useToggleWatchlistPause(latestWatchlist);

  const canReorderItems = canReorderWatchlistItems({
    itemOrderMode: latestItemOrderMode,
    itemCount: allItems.length,
    isReorderPending,
    isWatchedTogglePending,
  });

  const totalItems = latestWatchlist.stats.totalItems;
  const watchedItems = latestWatchlist.stats.watchedItems;

  return (
    <Container maxW="3xl" minH="100vh" px={{ base: 4, md: 8 }} pt={6} pb={32}>
      <WatchlistHeader
        watchlist={latestWatchlist}
        totalItems={totalItems}
        watchedItems={watchedItems}
        showUnwatchedOnly={showUnwatchedOnly}
        onFilterChange={setShowUnwatchedOnly}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onTogglePause={() => void togglePauseMutation.mutateAsync()}
        onDelete={() => setDeleteOpen(true)}
        interactionDisabled={isReorderPending}
      />

      <DeleteWatchlistDialog
        watchlist={latestWatchlist}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        deleting={deleting}
        handleDelete={() => void handleDelete()}
      />

      <Box mt={8}>
        <WatchlistTimeline
          items={allItems}
          activeFilters={activeFilters}
          itemOrderMode={latestItemOrderMode}
          hasMore={hasNextPage}
          isLoadingMore={isFetchingNextPage}
          onLoadMore={getLoadMoreHandler(isReorderPending, fetchNextPage)}
          canReorder={canReorderItems}
          interactionDisabled={isReorderPending}
          onReorder={reorderItemsMutation.prepare}
        />
      </Box>
    </Container>
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

function useDebouncedSearchQuery(searchQuery: string) {
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  return debouncedSearchQuery;
}
