import { useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  searchUnified,
  type MediaSearchOutcome,
  type SearchableMediaType,
} from "@/features/search/search/MediaSearch";

interface UseSearchResultsOptions {
  query: string;
  type: SearchableMediaType;
  initialData: MediaSearchOutcome;
}

function flattenResults(pages: MediaSearchOutcome[]) {
  return pages.flatMap((page) => (page.status === "ok" ? page.results : []));
}

function getNextMediaSearchPage(lastPage: MediaSearchOutcome) {
  if (lastPage.status !== "ok" || lastPage.page >= lastPage.totalPages) return undefined;
  return lastPage.page + 1;
}

function getCurrentOutcome(pages: MediaSearchOutcome[], initialData: MediaSearchOutcome) {
  const rejection = pages.find((page) => page.status !== "ok");
  return rejection ?? pages.at(0) ?? initialData;
}

export function useSearchResults({ query, type, initialData }: UseSearchResultsOptions) {
  const searchUnifiedFn = useServerFn(searchUnified);

  const fetchPage = useCallback(
    ({ pageParam }: { pageParam: number }) =>
      searchUnifiedFn({ data: { query, page: pageParam, type } }) as Promise<MediaSearchOutcome>,
    [query, type, searchUnifiedFn],
  );

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["search", query, type],
    queryFn: fetchPage,
    initialPageParam: 1,
    getNextPageParam: getNextMediaSearchPage,
    initialData: { pages: [initialData], pageParams: [1] },
  });

  const pages = data?.pages ?? [];
  const currentOutcome = getCurrentOutcome(pages, initialData);

  return {
    allResults: flattenResults(pages),
    status: currentOutcome.status,
    message: currentOutcome.message,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  };
}
