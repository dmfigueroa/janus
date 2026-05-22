import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";

export function useSearchNavigation(
  query: string,
  type: "movie" | "tv" | "game" | "book" | "comic" | "anime" | "manga",
) {
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
      navigate({
        to: "/search",
        search: {
          query,
          type: newType as typeof type,
        },
      });
    },
    [navigate, query],
  );

  return { handleSearch, handleTabChange };
}
