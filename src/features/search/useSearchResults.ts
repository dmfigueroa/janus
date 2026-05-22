import { useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useInfiniteQuery } from "@tanstack/react-query";
import { searchUnified } from "@/server/search";
import { DEPRECATED_MEDIA_MESSAGE, isDeprecatedMediaType } from "@/server/media";
import type { UnifiedMedia } from "@/server/media";

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
  type: "movie" | "tv" | "game" | "book" | "comic" | "anime" | "manga";
  initialData: SearchPage;
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
    initialData: !!query ? { pages: [initialData], pageParams: [1] } : undefined,
  });

  const allResults = data?.pages.flatMap((page) => page.results) || [];

  return {
    allResults,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  };
}

function emptyPage(page: number): SearchPage {
  return {
    results: [] as UnifiedMedia[],
    page,
    total_pages: 1,
    total_results: 0,
  };
}

function deprecatedPage(page: number): SearchPage {
  return {
    results: [] as UnifiedMedia[],
    page,
    total_pages: 1,
    total_results: 0,
    rejected: true,
    message: DEPRECATED_MEDIA_MESSAGE,
  };
}
