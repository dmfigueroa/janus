import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toaster } from "@/app/Toaster";
import type { WatchlistItem } from "@/db/Schema";
import { invalidateWatchlistQueries } from "@/features/watchlists/Cache";
import {
  optimisticallyToggleWatchedItem,
  restoreWatchlistDetailSnapshot,
} from "@/features/watchlists/detail/WatchlistDetailCache";
import { setWatchedState } from "@/features/watchlists/watched/SetWatchedState";

type UseToggleWatchedItemOptions = {
  updateWatchlistRecency?: boolean;
};

export function useToggleWatchedItem(
  item: WatchlistItem,
  { updateWatchlistRecency = true }: UseToggleWatchedItemOptions = {},
) {
  const queryClient = useQueryClient();
  const setWatchedStateFn = useServerFn(setWatchedState);
  const previousIsWatched = item.isWatched === true;
  const nextIsWatched = !previousIsWatched;

  return useMutation({
    mutationKey: ["watchlists", "toggle-watched", item.watchlistId],
    mutationFn: async () => {
      const result = await setWatchedStateFn({
        data: {
          itemId: item.id,
          isWatched: nextIsWatched,
          updateWatchlistRecency,
        },
      });
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
    onError: (_error, _variables, snapshot) => {
      restoreWatchlistDetailSnapshot({ queryClient, snapshot });
      toaster.create({ type: "error", title: "Failed to update status" });
    },
    onSettled: () => invalidateWatchlistQueries(queryClient),
  });
}
