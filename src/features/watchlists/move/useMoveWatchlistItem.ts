import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toaster } from "@/app/Toaster";
import type { WatchlistItem } from "@/db/Schema";
import type { InsertionPosition } from "@/features/watchlists/Order";
import { invalidateWatchlistQueries } from "@/features/watchlists/Cache";
import {
  optimisticallyRemoveWatchlistItem,
  restoreWatchlistDetailSnapshot,
  type WatchlistDetailCacheSnapshot,
} from "@/features/watchlists/detail/WatchlistDetailCache";
import { moveItemToWatchlist } from "./Mutation";

export function useMoveWatchlistItemMutation({ item }: { item: WatchlistItem }) {
  const queryClient = useQueryClient();
  const moveItemToWatchlistFn = useServerFn(moveItemToWatchlist);

  return useMutation({
    mutationKey: ["watchlists", "move-item", item.id],
    mutationFn: async ({
      destinationWatchlistId,
      position,
    }: {
      destinationWatchlistId: number;
      position?: InsertionPosition;
    }) => {
      const result = await moveItemToWatchlistFn({
        data: {
          itemId: item.id,
          destinationWatchlistId,
          position,
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
      toaster.create({ type: "error", title: "Failed to move item" });
    },
    onSuccess: (result) => {
      toaster.create({ type: "success", title: result.message });
    },
    onSettled: () => invalidateWatchlistQueries(queryClient),
  });
}
