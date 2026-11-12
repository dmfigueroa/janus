import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn, createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toaster } from "@/app/Toaster";
import type { WatchlistItem } from "@/db/Schema";
import { invalidateWatchlistQueries } from "@/features/watchlists/Cache";
import {
  optimisticallyRemoveWatchlistItem,
  optimisticallyRemoveWatchlistParent,
  restoreWatchlistDetailSnapshot,
} from "@/features/watchlists/detail/WatchlistDetailCache";
import {
  getWatchlistParentRemovalPreview,
  removeWatchlistItemMutation,
  removeWatchlistParentMutation,
} from "./RemoveFromWatchlist.server";

const removeWatchlistItemSchema = z.object({
  watchlistId: z.number(),
  itemId: z.number(),
});

const watchlistParentRemovalSchema = z.object({
  watchlistId: z.number(),
  parentId: z.string().min(1),
});

export type RemoveWatchlistItemInput = z.infer<typeof removeWatchlistItemSchema>;
export type WatchlistParentRemovalInput = z.infer<typeof watchlistParentRemovalSchema>;
export type WatchlistRemovalPreview = {
  count: number;
  watchedCount: number;
};

export const removeWatchlistItem = createServerFn({ method: "POST" })
  .inputValidator((data) => removeWatchlistItemSchema.parse(data))
  .handler(async ({ data }) => {
    return removeWatchlistItemMutation(data);
  });

export const removeWatchlistParent = createServerFn({ method: "POST" })
  .inputValidator((data) => watchlistParentRemovalSchema.parse(data))
  .handler(async ({ data }) => {
    return removeWatchlistParentMutation(data);
  });

export const getWatchlistParentRemovalPreviewQuery = createServerFn()
  .inputValidator((data) => watchlistParentRemovalSchema.parse(data))
  .handler(async ({ data }) => {
    return getWatchlistParentRemovalPreview(data);
  });

export function useRemoveWatchlistItemMutation({ item }: { item: WatchlistItem }) {
  const queryClient = useQueryClient();
  const removeWatchlistItemFn = useServerFn(removeWatchlistItem);

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

export function useRemoveWatchlistParentMutation({
  item,
  preview,
}: {
  item: WatchlistItem;
  preview?: WatchlistRemovalPreview;
}) {
  const queryClient = useQueryClient();
  const removeWatchlistParentFn = useServerFn(removeWatchlistParent);

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
    onMutate: () => optimisticallyRemoveParent({ queryClient, item, preview }),
    onError: (error, _variables, snapshot) => {
      restoreWatchlistDetailSnapshot({ queryClient, snapshot });
      toaster.create({
        type: "error",
        title: error instanceof Error ? error.message : "Failed to remove group",
      });
    },
    onSuccess: (result) => {
      toaster.create({ type: "success", title: result.message });
    },
    onSettled: () => invalidateWatchlistQueries(queryClient),
  });
}

export function useParentRemovalPreview({
  watchlistId,
  parentId,
  enabled,
}: {
  watchlistId: number;
  parentId: string | null;
  enabled: boolean;
}) {
  const getPreview = useServerFn(getWatchlistParentRemovalPreviewQuery);

  return useQuery({
    queryKey: ["watchlists", "remove-parent-preview", watchlistId, parentId],
    queryFn: () =>
      getPreview({
        data: {
          watchlistId,
          parentId: parentId ?? "",
        },
      }),
    enabled: enabled && parentId !== null,
    retry: false,
  });
}

function optimisticallyRemoveParent({
  queryClient,
  item,
  preview,
}: {
  queryClient: ReturnType<typeof useQueryClient>;
  item: WatchlistItem;
  preview?: WatchlistRemovalPreview;
}) {
  if (!item.parentId) {
    return undefined;
  }

  return optimisticallyRemoveWatchlistParent({
    queryClient,
    watchlistId: item.watchlistId,
    parentId: item.parentId,
    ...readRemovalPreviewCounts(preview),
  });
}

function readRemovalPreviewCounts(preview?: WatchlistRemovalPreview) {
  if (!preview) {
    return { removedCount: 0, watchedCount: 0 };
  }

  return { removedCount: preview.count, watchedCount: preview.watchedCount };
}
