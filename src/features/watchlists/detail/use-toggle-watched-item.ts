import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import type { WatchlistItem } from "@/db/schema";
import { invalidateWatchlistQueries } from "@/features/watchlists/cache";
import {
  optimisticallyToggleWatchedItem,
  restoreWatchlistDetailSnapshot,
} from "@/features/watchlists/detail/cache";
import { toggleWatched } from "@/features/watchlists/toggle/mutation";

export function useToggleWatchedItem(item: WatchlistItem) {
  const queryClient = useQueryClient();
  const toggleWatchedFn = useServerFn(toggleWatched);
  const previousIsWatched = item.isWatched === true;
  const nextIsWatched = !previousIsWatched;

  return useMutation({
    mutationFn: async () => {
      const result = await toggleWatchedFn({ data: { itemId: item.id, isWatched: nextIsWatched } });
      if (!result.success) {
        throw new Error(result.message);
      }
    },
    onMutate: () =>
      optimisticallyToggleWatchedItem({
        queryClient,
        watchlistId: item.watchlistId,
        itemId: item.id,
        previousIsWatched,
        nextIsWatched,
      }),
    onError: (_err, _variables, snapshot) => {
      restoreWatchlistDetailSnapshot({ queryClient, snapshot });
      toast.error("Failed to update status");
    },
    onSettled: () => invalidateWatchlistQueries(queryClient),
  });
}
