import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { UnifiedMediaSchema, type UnifiedMedia } from "@/server/Media";

export function useSearchNavigation(query: string, type: UnifiedMedia["mediaType"]) {
  const navigate = useNavigate();

  const handleSearch = useCallback(
    (newQuery: string) => {
      navigate({
        to: "/search",
        search: {
          query: newQuery,
          type,
        },
      });
    },
    [navigate, type],
  );

  const handleTabChange = useCallback(
    (newType: string) => {
      const parsedType = UnifiedMediaSchema.shape.mediaType.safeParse(newType);

      if (!parsedType.success) {
        return;
      }

      navigate({
        to: "/search",
        search: {
          query,
          type: parsedType.data,
        },
      });
    },
    [navigate, query],
  );

  return { handleSearch, handleTabChange };
}
