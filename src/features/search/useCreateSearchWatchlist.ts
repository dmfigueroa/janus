import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toaster } from "@/app/Toaster";
import { invalidateWatchlistQueries } from "@/features/watchlists/Cache";
import { createWatchlist } from "@/features/watchlists/create/Mutation";

export interface CreatedSearchWatchlist {
  label: string;
  value: string;
}

export function useCreateSearchWatchlist({
  onCreated,
}: {
  onCreated: (watchlist: CreatedSearchWatchlist) => void;
}) {
  const createWatchlistFn = useServerFn(createWatchlist);
  const queryClient = useQueryClient();
  const router = useRouter();

  const mutation = useMutation({
    mutationFn: (name: string) => createWatchlistFn({ data: { name } }),
    onSuccess: async (newWatchlist) => {
      onCreated({ label: newWatchlist.name, value: newWatchlist.id.toString() });
      await invalidateWatchlistQueries(queryClient);
      await router.invalidate?.();
    },
    onError: (error) => {
      console.error(error);
      toaster.create({ type: "error", title: "Failed to create watchlist" });
    },
  });

  return {
    createWatchlist: mutation.mutate,
    isCreating: mutation.isPending,
  };
}
