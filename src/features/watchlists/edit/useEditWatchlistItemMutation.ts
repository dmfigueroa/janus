import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { WatchlistItem } from "@/db/Schema";
import { invalidateWatchlistQueries } from "@/features/watchlists/Cache";
import { editWatchlistItem } from "./Mutation";

export type EditWatchlistItemValues = {
  title: string;
  releaseDate: string;
};

export function useEditWatchlistItemMutation(item: WatchlistItem) {
  const queryClient = useQueryClient();
  const editWatchlistItemFn = useServerFn(editWatchlistItem);

  return useMutation({
    mutationKey: ["watchlists", "edit-item", item.watchlistId, item.id],
    mutationFn: (values: EditWatchlistItemValues) =>
      editWatchlistItemFn({
        data: {
          watchlistId: item.watchlistId,
          itemId: item.id,
          title: values.title,
          releaseDate: values.releaseDate || null,
        },
      }),
    onSuccess: (result) => {
      if (result.success) {
        return invalidateWatchlistQueries(queryClient);
      }
    },
  });
}
