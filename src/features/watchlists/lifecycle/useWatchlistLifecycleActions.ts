import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toaster } from "@/app/Toaster";
import { invalidateLineupQueries } from "@/features/lineups/Cache";
import { invalidateWatchlistQueries } from "@/features/watchlists/Cache";
import {
  deleteWatchlist,
  pauseWatchlist,
  resumeWatchlist,
  skipWatchlist,
} from "./WatchlistLifecycleActions";

type WatchlistLifecycleTarget = {
  id: number;
  pausedAt: string | null;
};

type DeleteWatchlistOptions = {
  onDeleted?: () => Promise<void> | void;
};

export function useToggleWatchlistPause(watchlist: WatchlistLifecycleTarget) {
  const pauseWatchlistFn = useServerFn(pauseWatchlist);
  const resumeWatchlistFn = useServerFn(resumeWatchlist);
  const synchronize = useSynchronizeLifecycleCaches();

  return useMutation({
    mutationKey: ["watchlists", "toggle-pause", watchlist.id],
    mutationFn: async () => {
      const result = watchlist.pausedAt
        ? await resumeWatchlistFn({ data: { watchlistId: watchlist.id } })
        : await pauseWatchlistFn({ data: { watchlistId: watchlist.id } });
      requireSuccess(result);
    },
    onError: () => {
      toaster.create({
        type: "error",
        title: "Failed to change the pause state. Please try again.",
      });
    },
    onSettled: synchronize,
  });
}

export function useSkipWatchlist(watchlistId: number) {
  const skipWatchlistFn = useServerFn(skipWatchlist);
  const synchronize = useSynchronizeLifecycleCaches();

  return useMutation({
    mutationKey: ["watchlists", "skip", watchlistId],
    mutationFn: async () => {
      requireSuccess(await skipWatchlistFn({ data: { watchlistId } }));
    },
    onError: () => {
      toaster.create({ type: "error", title: "Failed to skip watchlist. Please try again." });
    },
    onSettled: synchronize,
  });
}

export function useDeleteWatchlist(
  watchlistId: number,
  { onDeleted }: DeleteWatchlistOptions = {},
) {
  const deleteWatchlistFn = useServerFn(deleteWatchlist);
  const synchronize = useSynchronizeLifecycleCaches();

  return useMutation({
    mutationKey: ["watchlists", "delete", watchlistId],
    mutationFn: async () => {
      requireSuccess(await deleteWatchlistFn({ data: { id: watchlistId } }));
    },
    onSuccess: async () => {
      await onDeleted?.();
    },
    onError: () => {
      toaster.create({ type: "error", title: "Failed to delete watchlist. Please try again." });
    },
    onSettled: synchronize,
  });
}

function useSynchronizeLifecycleCaches() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return async () => {
    await Promise.all([
      invalidateWatchlistQueries(queryClient),
      invalidateLineupQueries(queryClient),
    ]);
    await router.invalidate();
  };
}

function requireSuccess(result: { success: boolean; message?: string }) {
  if (!result.success) {
    throw new Error(result.message ?? "The watchlist action failed.");
  }
}
