import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toaster } from "@/app/Toaster";
import type { WatchlistItem } from "@/db/Schema";
import type { InsertionPosition } from "@/features/watchlists/Order";
import { invalidateWatchlistQueries } from "@/features/watchlists/Cache";
import {
  optimisticallyRemoveWatchlistParent,
  restoreWatchlistDetailSnapshot,
} from "@/features/watchlists/detail/WatchlistDetailCache";
import { moveParentToWatchlist } from "./Mutation";

export function useMoveWatchlistParentMutation({
  item,
  preview,
}: {
  item: WatchlistItem;
  preview?: {
    count: number;
    watchedCount: number;
  };
}) {
  const queryClient = useQueryClient();
  const moveParentToWatchlistFn = useServerFn(moveParentToWatchlist);

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
        parentId: item.parentId,
        removedCount: getPreviewCount(preview, 1),
        watchedCount: getPreviewWatchedCount(preview),
      });
    },
    onError: (error, _variables, snapshot) => {
      restoreWatchlistDetailSnapshot({ queryClient, snapshot });
      toaster.create({
        type: "error",
        title: error instanceof Error ? error.message : "Failed to move group",
      });
    },
    onSuccess: (result) => {
      toaster.create({ type: "success", title: result.message });
    },
    onSettled: () => invalidateWatchlistQueries(queryClient),
  });
}

function getPreviewCount(preview: { count: number } | undefined, fallback: number) {
  return preview ? preview.count : fallback;
}

function getPreviewWatchedCount(preview: { watchedCount: number } | undefined) {
  return preview ? preview.watchedCount : 0;
}
