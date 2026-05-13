import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { invalidateWatchlistQueries } from "@/features/watchlists/cache";
import {
  optimisticallyUpdateWatchlistItemOrderMode,
  rollbackWatchlistItemOrderMode,
} from "@/features/watchlists/detail/cache";
import { updateWatchlistItemOrderMode } from "@/features/watchlists/order-mode/mutation";
import type { WatchlistItemOrderMode } from "@/features/watchlists/order";

export function useItemOrderModeMutation({
  initialItemOrderMode,
  watchlistId,
  onOptimisticChange,
  onRollback,
}: {
  initialItemOrderMode: WatchlistItemOrderMode;
  watchlistId: number;
  onOptimisticChange: (nextItemOrderMode: WatchlistItemOrderMode) => void;
  onRollback: (previousItemOrderMode: WatchlistItemOrderMode) => void;
}) {
  const queryClient = useQueryClient();
  const updateWatchlistItemOrderModeFn = useServerFn(updateWatchlistItemOrderMode);

  return useMutation({
    mutationFn: async ({
      nextItemOrderMode,
    }: {
      nextItemOrderMode: WatchlistItemOrderMode;
      previousItemOrderMode: WatchlistItemOrderMode;
    }) => {
      const result = await updateWatchlistItemOrderModeFn({
        data: { watchlistId, itemOrderMode: nextItemOrderMode },
      });

      if (!result.success) {
        throw new Error(result.message);
      }
    },
    onMutate: async ({ nextItemOrderMode, previousItemOrderMode }) => {
      const snapshot = await optimisticallyUpdateWatchlistItemOrderMode({
        queryClient,
        watchlistId,
        nextItemOrderMode,
      });

      onOptimisticChange(nextItemOrderMode);

      return { previousItemOrderMode, snapshot };
    },
    onError: (error, _variables, context) => {
      rollbackWatchlistItemOrderMode({
        queryClient,
        snapshot: context?.snapshot,
      });
      onRollback(context?.previousItemOrderMode ?? initialItemOrderMode);
      toast.error(error instanceof Error ? error.message : "Failed to update item order");
    },
    onSettled: () => invalidateWatchlistQueries(queryClient),
  });
}
