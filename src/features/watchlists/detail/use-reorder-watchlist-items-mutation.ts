import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  optimisticallyReorderWatchlistItems,
  restoreWatchlistDetailSnapshot,
} from "@/features/watchlists/detail/cache";
import {
  watchlistDetailQueryKey,
  type WatchlistDetailQueryFilters,
} from "@/features/watchlists/detail/query";
import { reorderWatchlistItems } from "@/features/watchlists/reorder/mutation";

type ReorderWatchlistItemsInput = {
  movedItemId: number;
  referenceItemId: number;
  position: "before" | "after";
};

export function useReorderWatchlistItemsMutation({
  watchlistId,
  activeFilters,
}: {
  watchlistId: number;
  activeFilters: WatchlistDetailQueryFilters;
}) {
  const queryClient = useQueryClient();
  const reorderWatchlistItemsFn = useServerFn(reorderWatchlistItems);
  const activeQueryKey = watchlistDetailQueryKey(activeFilters);

  return useMutation({
    mutationFn: async (input: ReorderWatchlistItemsInput) => {
      const result = await reorderWatchlistItemsFn({
        data: { watchlistId, ...input },
      });

      if (!result.success) {
        throw new Error(result.message);
      }
    },
    onMutate: (input) =>
      optimisticallyReorderWatchlistItems({
        queryClient,
        watchlistId,
        activeQueryKey,
        ...input,
      }),
    onError: (error, _input, snapshot) => {
      restoreWatchlistDetailSnapshot({ queryClient, snapshot });
      toast.error(error instanceof Error ? error.message : "Failed to reorder watchlist");
    },
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: ["watchlists", "detail", watchlistId],
      }),
  });
}
