import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toaster } from "@/app/Toaster";
import type { Watchlist } from "@/db/Schema";
import { invalidateWatchlistQueries } from "@/features/watchlists/Cache";
import { pauseWatchlist, resumeWatchlist } from "./Mutation";

export function useToggleWatchlistPause(watchlist: Watchlist) {
  const queryClient = useQueryClient();
  const pauseWatchlistFn = useServerFn(pauseWatchlist);
  const resumeWatchlistFn = useServerFn(resumeWatchlist);

  return useMutation({
    mutationKey: ["watchlists", "toggle-pause", watchlist.id],
    mutationFn: async () => {
      const result = watchlist.pausedAt
        ? await resumeWatchlistFn({ data: { watchlistId: watchlist.id } })
        : await pauseWatchlistFn({ data: { watchlistId: watchlist.id } });
      if (!result.success) {
        throw new Error(result.message);
      }
    },
    onError: () => {
      toaster.create({
        type: "error",
        title: "Failed to change the pause state. Please try again.",
      });
    },
    onSettled: () => invalidateWatchlistQueries(queryClient),
  });
}
