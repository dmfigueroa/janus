import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import type { WatchlistItem } from "@/db/schema";
import { invalidateWatchlistQueries } from "@/features/watchlists/cache";
import {
  optimisticallyRemoveWatchlistItem,
  restoreWatchlistDetailSnapshot,
  type WatchlistDetailCacheSnapshot,
} from "@/features/watchlists/detail/cache";
import {
  watchlistDetailQueryKey,
  type WatchlistDetailQueryFilters,
} from "@/features/watchlists/detail/query";
import { moveItemToWatchlist } from "./mutation";

export function useMoveWatchlistItemMutation({
  item,
  activeFilters,
}: {
  item: WatchlistItem;
  activeFilters: WatchlistDetailQueryFilters;
}) {
  const queryClient = useQueryClient();
  const moveItemToWatchlistFn = useServerFn(moveItemToWatchlist);
  const activeQueryKey = watchlistDetailQueryKey(activeFilters);

  return useMutation({
    mutationKey: ["watchlists", "move-item", item.id],
    mutationFn: async (destinationWatchlistId: number) => {
      const result = await moveItemToWatchlistFn({
        data: {
          itemId: item.id,
          destinationWatchlistId,
        },
      });

      if (!result.success) {
        throw new Error(result.message);
      }

      return result;
    },
    onMutate: async () => {
      const snapshot: WatchlistDetailCacheSnapshot = await optimisticallyRemoveWatchlistItem({
        queryClient,
        watchlistId: item.watchlistId,
        activeQueryKey,
        itemId: item.id,
        removedCount: 1,
        watchedCount: item.isWatched ? 1 : 0,
      });

      return { snapshot };
    },
    onError: (_error, _variables, context) => {
      restoreWatchlistDetailSnapshot({
        queryClient,
        snapshot: context?.snapshot,
      });
      toast.error("Failed to move item");
    },
    onSuccess: (result) => {
      toast.success(result.message);
    },
    onSettled: () => invalidateWatchlistQueries(queryClient),
  });
}
