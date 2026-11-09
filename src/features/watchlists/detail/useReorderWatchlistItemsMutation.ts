import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toaster } from "@/app/Toaster";
import {
  optimisticallyReorderWatchlistItems,
  restoreWatchlistDetailSnapshot,
} from "@/features/watchlists/detail/Cache";
import {
  watchlistDetailQueryKey,
  type WatchlistDetailQueryFilters,
} from "@/features/watchlists/detail/Query";
import { reorderWatchlistItems } from "@/features/watchlists/reorder/Mutation";

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

  // The query cache owns the displayed order. Pending includes reconciliation,
  // so another drag cannot race the authoritative refresh or rollback.
  const mutation = useMutation({
    mutationFn: async ({ input }: ReorderRequest) => {
      const result = await reorderWatchlistItemsFn({
        data: { watchlistId, ...input },
      });

      if (!result.success) {
        throw new Error(result.message);
      }
    },
    onMutate: async ({ input, prepared = ignorePreparation }: ReorderRequest) => {
      try {
        const snapshot = await optimisticallyReorderWatchlistItems({
          queryClient,
          watchlistId,
          activeQueryKey,
          ...input,
        });
        prepared(true);
        return snapshot;
      } catch (error) {
        prepared(false);
        throw error;
      }
    },
    onSuccess: () => {
      toaster.create({ type: "success", title: "Order saved", duration: 2000 });
    },
    onError: (error, _input, snapshot) => {
      restoreWatchlistDetailSnapshot({ queryClient, snapshot });
      toaster.create({
        type: "error",
        title: error instanceof Error ? error.message : "Failed to reorder watchlist",
      });
    },
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: ["watchlists", "detail", watchlistId],
      }),
  });

  return {
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    isError: mutation.isError,
    mutate: (input: ReorderWatchlistItemsInput) => mutation.mutate({ input }),
    prepare: (input: ReorderWatchlistItemsInput) =>
      new Promise<boolean>((prepared) => mutation.mutate({ input, prepared })),
  };
}

type ReorderRequest = {
  input: ReorderWatchlistItemsInput;
  prepared?: (ready: boolean) => void;
};

function ignorePreparation() {}
