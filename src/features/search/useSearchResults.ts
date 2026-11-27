import { useServerFn } from "@tanstack/react-start";
import {
  infiniteQueryOptions,
  useSuspenseInfiniteQuery,
  type InfiniteData,
} from "@tanstack/react-query";
import {
  EMPTY_MEDIA_SEARCH_MESSAGE,
  normalizeMediaSearchQuery,
  searchUnified,
  type MediaSearchOutcome,
  type SearchableMediaType,
} from "@/features/search/search/MediaSearch";

export const SEARCH_MEDIA_STALE_TIME_MS = 30_000;

export type SearchMediaQueryFilters = {
  query: string;
  type: SearchableMediaType;
};

export type FetchMediaSearchPage = (input: {
  data: { query: string; page: number; type: SearchableMediaType };
}) => Promise<MediaSearchOutcome>;

function flattenResults(pages: MediaSearchOutcome[]) {
  return pages.flatMap((page) => (page.status === "ok" ? page.results : []));
}

function getNextMediaSearchPage(lastPage: MediaSearchOutcome) {
  if (lastPage.status !== "ok" || lastPage.page >= lastPage.totalPages) return undefined;
  return lastPage.page + 1;
}

function getCurrentOutcome(pages: MediaSearchOutcome[]): MediaSearchOutcome {
  const rejection = pages.find((page) => page.status !== "ok");
  return (
    rejection ??
    pages[0] ?? {
      status: "empty_query",
      page: 1,
      message: EMPTY_MEDIA_SEARCH_MESSAGE,
    }
  );
}

function isInitialSearchFetching(isFetching: boolean, isFetchingNextPage: boolean) {
  return isFetching && !isFetchingNextPage;
}

function hasProviderUnavailablePage(data: InfiniteData<MediaSearchOutcome, number> | undefined) {
  if (!data) {
    return false;
  }

  return data.pages.some((page) => page.status === "provider_unavailable");
}

function resolveSearchStaleTime(data: InfiniteData<MediaSearchOutcome, number> | undefined) {
  return hasProviderUnavailablePage(data) ? 0 : SEARCH_MEDIA_STALE_TIME_MS;
}

export function searchMediaQueryKey({ query, type }: SearchMediaQueryFilters) {
  return ["search", normalizeMediaSearchQuery(query), type] as const;
}

export function searchMediaInfiniteQueryOptions(
  { query, type }: SearchMediaQueryFilters,
  fetchPage: FetchMediaSearchPage = searchUnified,
) {
  const normalizedQuery = normalizeMediaSearchQuery(query);

  return infiniteQueryOptions({
    queryKey: searchMediaQueryKey({ query: normalizedQuery, type }),
    queryFn: ({ pageParam }) =>
      fetchPage({ data: { query: normalizedQuery, page: pageParam, type } }),
    initialPageParam: 1,
    getNextPageParam: getNextMediaSearchPage,
    staleTime: (cachedQuery) => resolveSearchStaleTime(cachedQuery.state.data),
  });
}

export function useSearchResults({ query, type }: SearchMediaQueryFilters) {
  const searchUnifiedFn = useServerFn(searchUnified);

  const { data, dataUpdatedAt, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage } =
    useSuspenseInfiniteQuery(searchMediaInfiniteQueryOptions({ query, type }, searchUnifiedFn));

  const pages = data.pages;
  const currentOutcome = getCurrentOutcome(pages);

  return {
    allResults: flattenResults(pages),
    status: currentOutcome.status,
    message: currentOutcome.message,
    dataUpdatedAt,
    isLoading: isInitialSearchFetching(isFetching, isFetchingNextPage),
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  };
}
