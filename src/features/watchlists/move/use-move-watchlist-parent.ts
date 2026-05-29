import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import type { WatchlistItem } from "@/db/schema";
import type { InsertionPosition } from "@/features/watchlists/insert-ordered-item.server";
import { invalidateWatchlistQueries } from "@/features/watchlists/cache";
import {
  optimisticallyRemoveWatchlistParent,
  restoreWatchlistDetailSnapshot,
} from "@/features/watchlists/detail/cache";
import {
  watchlistDetailQueryKey,
  type WatchlistDetailQueryFilters,
} from "@/features/watchlists/detail/query";
import { moveParentToWatchlist } from "./mutation";

export function useMoveWatchlistParentMutation({
  item,
  activeFilters,
  preview,
}: {
  item: WatchlistItem;
  activeFilters: WatchlistDetailQueryFilters;
  preview?: {
    count: number;
    watchedCount: number;
  };
}) {
  const queryClient = useQueryClient();
  const moveParentToWatchlistFn = useServerFn(moveParentToWatchlist);
  const activeQueryKey = watchlistDetailQueryKey(activeFilters);

  return useMutation({
    mutationKey: ["watchlists", "move-parent", item.id],
    mutationFn: async ({
      destinationWatchlistId,
      position,
    }: {
      destinationWatchlistId: number;
      position?: InsertionPosition;
    }) => {
      const result = await moveParentToWatchlistFn({
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
    onMutate: () => {
      if (!item.parentId) {
        return undefined;
      }

      return optimisticallyRemoveWatchlistParent({
        queryClient,
        watchlistId: item.watchlistId,
        activeQueryKey,
        parentId: item.parentId,
        removedCount: preview?.count ?? 1,
        watchedCount: preview?.watchedCount ?? 0,
      });
    },
    onError: (error, _variables, snapshot) => {
      restoreWatchlistDetailSnapshot({ queryClient, snapshot });
      toast.error(error instanceof Error ? error.message : "Failed to move group");
    },
    onSuccess: (result) => {
      toast.success(result.message);
    },
    onSettled: () => invalidateWatchlistQueries(queryClient),
  });
}
