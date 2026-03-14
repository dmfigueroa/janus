"use client";

import { useQuery } from "@tanstack/react-query";
import { getWatchlists } from "@/server/controllers/watchlists.controller";

export function useWatchlistOptions(isOpen: boolean) {
  return useQuery({
    queryKey: ["watchlists"],
    queryFn: () => getWatchlists({ data: { sortBy: "lastAdded" } }),
    enabled: isOpen,
  });
}
