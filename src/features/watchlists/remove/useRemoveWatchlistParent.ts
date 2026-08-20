import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import type { WatchlistItem } from "@/db/Schema";
import { invalidateWatchlistQueries } from "@/features/watchlists/Cache";
import {
  optimisticallyRemoveWatchlistParent,
  restoreWatchlistDetailSnapshot,
} from "@/features/watchlists/detail/Cache";
import {
  watchlistDetailQueryKey,
  type WatchlistDetailQueryFilters,
} from "@/features/watchlists/detail/Query";
import { removeWatchlistParent } from "./Mutation";

export function useRemoveWatchlistParentMutation({
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
  const removeWatchlistParentFn = useServerFn(removeWatchlistParent);
  const activeQueryKey = watchlistDetailQueryKey(activeFilters);

  return useMutation({
    mutationKey: ["watchlists", "remove-parent", item.watchlistId, item.parentId],
    mutationFn: async () => {
      if (!item.parentId) {
        throw new Error("Parent removal is unavailable for this item.");
      }

      const result = await removeWatchlistParentFn({
        data: {
          watchlistId: item.watchlistId,
          parentId: item.parentId,
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
        removedCount: getPreviewCount(preview),
        watchedCount: getPreviewWatchedCount(preview),
      });
    },
    onError: (error, _variables, snapshot) => {
      restoreWatchlistDetailSnapshot({ queryClient, snapshot });
      toast.error(error instanceof Error ? error.message : "Failed to remove group");
    },
    onSuccess: (result) => {
      toast.success(result.message);
    },
    onSettled: () => invalidateWatchlistQueries(queryClient),
  });
}

function getPreviewCount(preview: { count: number } | undefined) {
  return preview ? preview.count : 0;
}

function getPreviewWatchedCount(preview: { watchedCount: number } | undefined) {
  return preview ? preview.watchedCount : 0;
}
