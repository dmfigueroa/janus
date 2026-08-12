import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWatchlistParentRemovalPreviewQuery } from "./query";

export function useParentRemovalPreview({
  watchlistId,
  parentId,
  enabled,
}: {
  watchlistId: number;
  parentId: string | null;
  enabled: boolean;
}) {
  const getPreview = useServerFn(getWatchlistParentRemovalPreviewQuery);

  return useQuery({
    queryKey: ["watchlists", "remove-parent-preview", watchlistId, parentId],
    queryFn: () =>
      getPreview({
        data: {
          watchlistId,
          parentId: parentId ?? "",
        },
      }),
    enabled: enabled && parentId !== null,
    retry: false,
  });
}
