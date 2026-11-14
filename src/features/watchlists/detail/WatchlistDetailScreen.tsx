import { useEffect, useState, useMemo } from "react";
import { Box, Container } from "@chakra-ui/react";
import { useInfiniteQuery, useIsMutating, type InfiniteData } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toaster } from "@/app/Toaster";
import { DeleteWatchlistDialog } from "@/features/watchlists/components/DeleteWatchlistDialog";
import { WatchlistHeader } from "@/features/watchlists/components/WatchlistHeader";
import { WatchlistTimeline } from "@/features/watchlists/components/WatchlistTimeline";
import {
  getWatchlistDetailPage,
  watchlistDetailInfiniteQueryOptions,
  type WatchlistDetailQueryData,
} from "@/features/watchlists/detail/Query";
import { useWatchlistReorder } from "@/features/watchlists/detail/useWatchlistReorder";
import {
  useDeleteWatchlist,
  useToggleWatchlistPause,
} from "@/features/watchlists/lifecycle/useWatchlistLifecycleActions";

interface WatchlistDetailScreenProps {
  initialData: WatchlistDetailQueryData;
}

export function WatchlistDetailScreen({ initialData }: WatchlistDetailScreenProps) {
  const watchlistId = initialData.watchlist.id;
  const [deleteOpen, setDeleteOpen] = useState(false);
  const navigate = useNavigate();
  const [showUnwatchedOnly, setShowUnwatchedOnly] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedSearchQuery(searchQuery);

  const normalizedSearchQuery = normalizeSearchQuery(debouncedSearchQuery);
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useWatchlistTimelineData(
    watchlistId,
    normalizedSearchQuery,
    initialData.watchlist.itemOrderMode,
  );

  const { allItems, latestWatchlist } = getCurrentDetailData(data, initialData.watchlist);
  const latestItemOrderMode = latestWatchlist.itemOrderMode;
  const remove = useDeleteWatchlist(watchlistId, {
    onDeleted: async () => {
      setDeleteOpen(false);
      toaster.create({ type: "success", title: "Watchlist deleted" });
      await navigate({ to: "/", replace: true });
    },
  });
  const togglePauseMutation = useToggleWatchlistPause(latestWatchlist);

  const handleDelete = async () => {
    try {
      await remove.mutateAsync();
    } catch {
      return;
    }
  };

  const handleTogglePause = async () => {
    try {
      await togglePauseMutation.mutateAsync();
    } catch {
      return;
    }
  };

  const activeFilters = useMemo(
    () => ({
      watchlistId,
      itemOrderMode: initialData.watchlist.itemOrderMode,
      query: normalizedSearchQuery,
      unwatchedOnly: false,
    }),
    [watchlistId, initialData.watchlist.itemOrderMode, normalizedSearchQuery],
  );

  const isWatchedTogglePending =
    useIsMutating({ mutationKey: ["watchlists", "toggle-watched", watchlistId] }) > 0;
  const reorder = useWatchlistReorder({
    watchlistId,
    activeFilters,
    items: allItems,
    itemOrderMode: latestItemOrderMode,
    canReorder: !isWatchedTogglePending && allItems.length > 1,
  });
  const isReorderPending = reorder.isPending;

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
        onTogglePause={() => void handleTogglePause()}
        onDelete={() => setDeleteOpen(true)}
        interactionDisabled={isReorderPending}
      />

      <DeleteWatchlistDialog
        watchlist={latestWatchlist}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        deleting={remove.isPending}
        handleDelete={() => void handleDelete()}
      />

      <Box mt={8}>
        <WatchlistTimeline
          items={allItems}
          unwatchedOnly={showUnwatchedOnly}
          itemOrderMode={latestItemOrderMode}
          hasMore={hasNextPage}
          isLoadingMore={isFetchingNextPage}
          onLoadMore={getLoadMoreHandler(isReorderPending, fetchNextPage)}
          reorder={reorder}
          interactionDisabled={isReorderPending}
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

function useWatchlistTimelineData(
  watchlistId: number,
  normalizedSearchQuery: string | undefined,
  itemOrderMode: "release" | "custom",
) {
  const getWatchlistDetailPageFn = useServerFn(getWatchlistDetailPage);

  return useInfiniteQuery({
    ...watchlistDetailInfiniteQueryOptions({
      watchlistId,
      query: normalizedSearchQuery,
      unwatchedOnly: false,
      itemOrderMode,
    }),
    queryFn: async ({ pageParam }) => {
      const detail = await getWatchlistDetailPageFn({
        data: {
          watchlistId,
          query: normalizedSearchQuery,
          unwatchedOnly: false,
          cursor: pageParam,
        },
      });

      if (!detail) {
        throw new Error("Watchlist not found");
      }

      return detail;
    },
  });
}
