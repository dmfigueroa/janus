import { useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useInfiniteQuery } from "@tanstack/react-query";
import { searchUnified } from "@/features/search/search/MediaSearch";
import { DEPRECATED_MEDIA_MESSAGE, isDeprecatedMediaType } from "@/server/Media";
import type { UnifiedMedia } from "@/server/Media";

type SearchPage = {
  results: UnifiedMedia[];
  page: number;
  total_pages: number;
  total_results: number;
  rejected?: boolean;
  message?: string;
};

interface UseSearchResultsOptions {
  query: string;
  type: UnifiedMedia["mediaType"];
  initialData: SearchPage;
}

function getInitialData(query: string, initialData: SearchPage) {
  if (!query) return undefined;
  return { pages: [initialData], pageParams: [1] };
}

function flattenResults(data: { pages: SearchPage[] } | undefined) {
  if (!data) return [];
  return data.pages.flatMap((page) => page.results);
}

function getRejectionMessage(data: { pages: SearchPage[] } | undefined) {
  return data?.pages.find((page) => page.rejected)?.message;
}

export function useSearchResults({ query, type, initialData }: UseSearchResultsOptions) {
  const searchUnifiedFn = useServerFn(searchUnified);

  const fetchPage = useCallback(
    ({ pageParam }: { pageParam: number }): Promise<SearchPage> => {
      if (!query) {
        return Promise.resolve(emptyPage(pageParam));
      }

      if (isDeprecatedMediaType(type)) {
        return Promise.resolve(deprecatedPage(pageParam));
      }

      return searchUnifiedFn({ data: { query, page: pageParam, type } }) as Promise<SearchPage>;
    },
    [query, type, searchUnifiedFn],
  );

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["search", query, type],
    queryFn: fetchPage,
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined,
    initialData: getInitialData(query, initialData),
  });

  const allResults = flattenResults(data);
  const rejectionMessage = getRejectionMessage(data);

  return {
    allResults,
    rejectionMessage,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  };
}

function emptyPage(page: number): SearchPage {
  return {
    results: [],
    page,
    total_pages: 1,
    total_results: 0,
  };
}

function deprecatedPage(page: number): SearchPage {
  return {
    results: [],
    page,
    total_pages: 1,
    total_results: 0,
    rejected: true,
    message: DEPRECATED_MEDIA_MESSAGE,
  };
}
