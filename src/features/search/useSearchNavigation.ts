import { useCallback } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  searchableMediaTypes,
  type SearchableMediaType,
} from "@/features/search/search/MediaSearch";

export function useSearchNavigation(query: string, type: SearchableMediaType) {
  const navigate = useNavigate();
  const isNavigating = useRouterState({ select: (state) => state.isLoading });

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
      const parsedType = searchableMediaTypes.find((type) => type === newType);
      if (!parsedType) {
        return;
      }

      navigate({
        to: "/search",
        search: {
          query,
          type: parsedType,
        },
      });
    },
    [navigate, query],
  );

  return { handleSearch, handleTabChange, isNavigating };
}
