// @vitest-environment jsdom

import { createElement, Suspense, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, dehydrate, hydrate } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PROVIDER_UNAVAILABLE_MESSAGE,
  type MediaSearchOutcome,
} from "@/features/search/search/MediaSearch";

const searchUnifiedFnMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => searchUnifiedFnMock,
  createServerFn: () => {
    const chain = { validator: () => chain, handler: (handler: unknown) => handler };
    return chain;
  },
}));

vi.mock("@/features/search/search/MediaSearch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/search/search/MediaSearch")>();
  return { ...actual, searchUnified: vi.fn() };
});

import {
  searchMediaInfiniteQueryOptions,
  searchMediaQueryKey,
  useSearchResults,
} from "@/features/search/useSearchResults";

const emptyOutcome: MediaSearchOutcome = {
  status: "empty_query",
  page: 1,
  message: "Enter a search term to find media.",
};

const movieOutcome: MediaSearchOutcome = {
  status: "ok",
  results: [
    { id: "1", title: "A", mediaType: "movie", source: "tmdb", poster: null },
    { id: "2", title: "B", mediaType: "movie", source: "tmdb", poster: null },
  ],
  page: 1,
  totalPages: 2,
  totalResults: 3,
};

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(Suspense, { fallback: null }, children),
    );
  };
}

describe("useSearchResults", () => {
  beforeEach(() => {
    searchUnifiedFnMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("normalizes query keys and server inputs by trimming whitespace", async () => {
    expect(searchMediaQueryKey({ query: "  star wars  ", type: "movie" })).toEqual([
      "search",
      "star wars",
      "movie",
    ]);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    searchUnifiedFnMock.mockResolvedValue(movieOutcome);

    const { result } = renderHook(
      () => useSearchResults({ query: "  star wars  ", type: "movie" }),
      {
        wrapper: createWrapper(queryClient),
      },
    );

    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(searchUnifiedFnMock).toHaveBeenCalledTimes(1);
    expect(searchUnifiedFnMock).toHaveBeenCalledWith({
      data: { query: "star wars", page: 1, type: "movie" },
    });
  });

  it("hydrates SSR-primed search data without firing a duplicate page-1 request on mount", async () => {
    const serverClient = new QueryClient();
    const serverFetch = vi.fn().mockResolvedValue(movieOutcome);
    await serverClient.ensureInfiniteQueryData(
      searchMediaInfiniteQueryOptions({ query: "star wars", type: "movie" }, serverFetch),
    );

    const clientQueryClient = new QueryClient();
    hydrate(clientQueryClient, dehydrate(serverClient));

    const { result } = renderHook(() => useSearchResults({ query: " star wars ", type: "movie" }), {
      wrapper: createWrapper(clientQueryClient),
    });

    expect(result.current.status).toBe("ok");
    expect(result.current.allResults.map((media) => media.title)).toEqual(["A", "B"]);
    expect(result.current.hasNextPage).toBe(true);
    expect(serverFetch).toHaveBeenCalledTimes(1);
    expect(searchUnifiedFnMock).not.toHaveBeenCalled();
  });

  it("does not cache provider_unavailable as fresh and retries on mount", async () => {
    const unavailableOutcome: MediaSearchOutcome = {
      status: "provider_unavailable",
      page: 1,
      message: PROVIDER_UNAVAILABLE_MESSAGE,
    };
    const twoSecondsAgo = Date.now() - 2_000;
    const clientQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    clientQueryClient.setQueryData(
      searchMediaQueryKey({ query: "dune", type: "book" }),
      { pages: [unavailableOutcome], pageParams: [1] },
      { updatedAt: twoSecondsAgo },
    );
    clientQueryClient.setQueryData(
      searchMediaQueryKey({ query: "star wars", type: "movie" }),
      { pages: [movieOutcome], pageParams: [1] },
      { updatedAt: twoSecondsAgo },
    );
    searchUnifiedFnMock.mockResolvedValue(movieOutcome);

    renderHook(() => useSearchResults({ query: "star wars", type: "movie" }), {
      wrapper: createWrapper(clientQueryClient),
    });
    expect(searchUnifiedFnMock).not.toHaveBeenCalled();

    const { result } = renderHook(() => useSearchResults({ query: "dune", type: "book" }), {
      wrapper: createWrapper(clientQueryClient),
    });

    await waitFor(() => expect(searchUnifiedFnMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.status).toBe("ok"));
  });

  it("requests page 2 through useServerFn and flattens successful pages only", async () => {
    const secondPage: MediaSearchOutcome = {
      status: "ok",
      results: [{ id: "3", title: "C", mediaType: "movie", source: "tmdb", poster: null }],
      page: 2,
      totalPages: 2,
      totalResults: 3,
    };
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(searchMediaQueryKey({ query: "star wars", type: "movie" }), {
      pages: [movieOutcome],
      pageParams: [1],
    });
    searchUnifiedFnMock.mockResolvedValue(secondPage);

    const { result } = renderHook(() => useSearchResults({ query: "star wars", type: "movie" }), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.allResults.map((media) => media.title)).toEqual(["A", "B"]);
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    expect(searchUnifiedFnMock).toHaveBeenCalledTimes(1);
    expect(searchUnifiedFnMock).toHaveBeenCalledWith({
      data: { query: "star wars", page: 2, type: "movie" },
    });
    await waitFor(() =>
      expect(result.current.allResults.map((media) => media.title)).toEqual(["A", "B", "C"]),
    );
    expect(result.current.hasNextPage).toBe(false);
  });

  it("surfaces a rejection from any page while preserving earlier results", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(searchMediaQueryKey({ query: "test", type: "movie" }), {
      pages: [
        movieOutcome,
        {
          status: "provider_unavailable",
          page: 2,
          message: PROVIDER_UNAVAILABLE_MESSAGE,
        },
      ],
      pageParams: [1, 2],
    });
    searchUnifiedFnMock.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useSearchResults({ query: "test", type: "movie" }), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.status).toBe("provider_unavailable");
    expect(result.current.message).toBe(PROVIDER_UNAVAILABLE_MESSAGE);
    expect(result.current.allResults.map((media) => media.title)).toEqual(["A", "B"]);
  });

  it("exposes the rejection status and message from the first page without refetching deterministic rejections", () => {
    const deprecatedOutcome: MediaSearchOutcome = {
      status: "deprecated_media_type",
      page: 1,
      message: "Anime and manga categories are deprecated while we revisit provider data quality.",
    };
    const queryClient = new QueryClient();
    queryClient.setQueryData(searchMediaQueryKey({ query: "naruto", type: "anime" }), {
      pages: [deprecatedOutcome],
      pageParams: [1],
    });

    const { result } = renderHook(() => useSearchResults({ query: "naruto", type: "anime" }), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.status).toBe("deprecated_media_type");
    expect(result.current.message).toBe(deprecatedOutcome.message);
    expect(result.current.allResults).toEqual([]);
    expect(result.current.hasNextPage).toBe(false);
    expect(searchUnifiedFnMock).not.toHaveBeenCalled();
  });

  it("delegates blank queries to the shared search boundary when unprimed", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    searchUnifiedFnMock.mockResolvedValue(emptyOutcome);

    const { result } = renderHook(() => useSearchResults({ query: "", type: "movie" }), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.status).toBe("empty_query"));
    expect(searchUnifiedFnMock).toHaveBeenCalledWith({
      data: { query: "", page: 1, type: "movie" },
    });
  });

  it("only paginates successful, unfinished searches", () => {
    const options = searchMediaInfiniteQueryOptions({ query: "test", type: "movie" });

    expect(options.getNextPageParam(movieOutcome, [movieOutcome], 1, [1])).toBe(2);
    expect(
      options.getNextPageParam({ ...movieOutcome, page: 2 }, [movieOutcome], 2, [1, 2]),
    ).toBeUndefined();
    expect(
      options.getNextPageParam(
        {
          status: "provider_unavailable",
          page: 1,
          message: "unavailable",
        },
        [],
        1,
        [1],
      ),
    ).toBeUndefined();
  });
});
