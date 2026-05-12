import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  invalidateWatchlistQueries,
  optimisticallyReorderWatchlistItems,
  rollbackWatchlistReorder,
} from "@/features/watchlists/detail/cache";
import { reorderWatchlistItems } from "@/features/watchlists/reorder/mutation";

export function useReorderWatchlistItemsMutation({ watchlistId }: { watchlistId: number }) {
  const queryClient = useQueryClient();
  const reorderWatchlistItemsFn = useServerFn(reorderWatchlistItems);

  return useMutation({
    mutationFn: async (itemIds: number[]) => {
      const result = await reorderWatchlistItemsFn({
        data: { watchlistId, itemIds },
      });

      if (!result.success) {
        throw new Error(result.message);
      }
    },
    onMutate: (itemIds) =>
      optimisticallyReorderWatchlistItems({
        queryClient,
        watchlistId,
        itemIds,
      }),
    onError: (error, _itemIds, snapshot) => {
      rollbackWatchlistReorder({ queryClient, snapshot });
      toast.error(error instanceof Error ? error.message : "Failed to reorder watchlist");
    },
    onSettled: () => invalidateWatchlistQueries(queryClient),
  });
}
