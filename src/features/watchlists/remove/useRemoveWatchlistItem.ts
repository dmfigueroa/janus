import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toaster } from "@/app/Toaster";
import type { WatchlistItem } from "@/db/Schema";
import { invalidateWatchlistQueries } from "@/features/watchlists/Cache";
import {
  optimisticallyRemoveWatchlistItem,
  restoreWatchlistDetailSnapshot,
} from "@/features/watchlists/detail/Cache";
import {
  watchlistDetailQueryKey,
  type WatchlistDetailQueryFilters,
} from "@/features/watchlists/detail/Query";
import { removeWatchlistItem } from "./Mutation";

export function useRemoveWatchlistItemMutation({
  item,
  activeFilters,
}: {
  item: WatchlistItem;
  activeFilters: WatchlistDetailQueryFilters;
}) {
  const queryClient = useQueryClient();
  const removeWatchlistItemFn = useServerFn(removeWatchlistItem);
  const activeQueryKey = watchlistDetailQueryKey(activeFilters);

  return useMutation({
    mutationKey: ["watchlists", "remove-item", item.watchlistId, item.id],
    mutationFn: async () => {
      const result = await removeWatchlistItemFn({
        data: {
          watchlistId: item.watchlistId,
          itemId: item.id,
        },
      });

      if (!result.success) {
        throw new Error(result.message);
      }

      return result;
    },
    onMutate: () =>
      optimisticallyRemoveWatchlistItem({
        queryClient,
        watchlistId: item.watchlistId,
        activeQueryKey,
        itemId: item.id,
        removedCount: 1,
        watchedCount: item.isWatched ? 1 : 0,
      }),
    onError: (_error, _variables, snapshot) => {
      restoreWatchlistDetailSnapshot({ queryClient, snapshot });
      toaster.create({ type: "error", title: "Failed to remove item" });
    },
    onSuccess: (result) => {
      toaster.create({ type: "success", title: result.message });
    },
    onSettled: () => invalidateWatchlistQueries(queryClient),
  });
}
