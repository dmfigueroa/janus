// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  PROVIDER_UNAVAILABLE_MESSAGE,
  type MediaSearchOutcome,
} from "@/features/search/search/MediaSearch";

const searchUnifiedFnMock = vi.fn();

vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => searchUnifiedFnMock,
  createServerFn: () => {
    const chain = { validator: () => chain, handler: (handler: unknown) => handler };
    return chain;
  },
}));

type InfiniteQueryOptions = {
  queryFn?: (context: { pageParam: number }) => Promise<unknown>;
  getNextPageParam?: (lastPage: MediaSearchOutcome) => number | undefined;
  initialData?: { pages: MediaSearchOutcome[]; pageParams: number[] };
};

let capturedOptions: InfiniteQueryOptions | undefined;

const mockReturn = {
  data: undefined as { pages: MediaSearchOutcome[]; pageParams: number[] } | undefined,
  fetchNextPage: vi.fn(),
  hasNextPage: false,
  isFetchingNextPage: false,
};

vi.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: (options: InfiniteQueryOptions) => {
    capturedOptions = options;
    return mockReturn;
  },
}));

vi.mock("@/features/search/search/MediaSearch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/search/search/MediaSearch")>();
  return { ...actual, searchUnified: vi.fn() };
});

import { useSearchResults } from "@/features/search/useSearchResults";

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
  totalResults: 2,
};

describe("useSearchResults", () => {
  beforeEach(() => {
    searchUnifiedFnMock.mockReset();
    capturedOptions = undefined;
    mockReturn.data = undefined;
  });

  it("requests the shared search boundary even for a blank query", async () => {
    renderHook(() => useSearchResults({ query: "", type: "movie", initialData: emptyOutcome }));

    await capturedOptions!.queryFn!({ pageParam: 1 });

    expect(searchUnifiedFnMock).toHaveBeenCalledWith({
      data: { query: "", page: 1, type: "movie" },
    });
  });

  it("requests the next page from the shared search boundary", async () => {
    renderHook(() =>
      useSearchResults({ query: "star wars", type: "movie", initialData: movieOutcome }),
    );

    await capturedOptions!.queryFn!({ pageParam: 2 });

    expect(searchUnifiedFnMock).toHaveBeenCalledWith({
      data: { query: "star wars", page: 2, type: "movie" },
    });
  });

  it("seeds infinite query data with the route loader outcome", () => {
    renderHook(() => useSearchResults({ query: "", type: "movie", initialData: emptyOutcome }));

    expect(capturedOptions!.initialData).toEqual({ pages: [emptyOutcome], pageParams: [1] });
  });

  it("flattens results from successful pages only", () => {
    const secondPage: MediaSearchOutcome = {
      status: "ok",
      results: [{ id: "3", title: "C", mediaType: "movie", source: "tmdb", poster: null }],
      page: 2,
      totalPages: 2,
      totalResults: 3,
    };
    mockReturn.data = {
      pages: [movieOutcome, secondPage],
      pageParams: [1, 2],
    };

    const { result } = renderHook(() =>
      useSearchResults({ query: "test", type: "movie", initialData: movieOutcome }),
    );

    expect(result.current.allResults.map((media) => media.title)).toEqual(["A", "B", "C"]);
    expect(result.current.status).toBe("ok");
    expect(result.current.message).toBeUndefined();
  });

  it("surfaces a rejection from any page", () => {
    mockReturn.data = {
      pages: [
        movieOutcome,
        {
          status: "provider_unavailable",
          page: 2,
          message: PROVIDER_UNAVAILABLE_MESSAGE,
        },
      ],
      pageParams: [1, 2],
    };

    const { result } = renderHook(() =>
      useSearchResults({ query: "test", type: "movie", initialData: movieOutcome }),
    );

    expect(result.current.status).toBe("provider_unavailable");
    expect(result.current.message).toBe(PROVIDER_UNAVAILABLE_MESSAGE);
    expect(result.current.allResults.map((media) => media.title)).toEqual(["A", "B"]);
  });

  it("exposes the rejection status and message from the first page", () => {
    const deprecatedOutcome: MediaSearchOutcome = {
      status: "deprecated_media_type",
      page: 1,
      message: "Anime and manga categories are deprecated while we revisit provider data quality.",
    };
    mockReturn.data = { pages: [deprecatedOutcome], pageParams: [1] };

    const { result } = renderHook(() =>
      useSearchResults({ query: "naruto", type: "anime", initialData: deprecatedOutcome }),
    );

    expect(result.current.status).toBe("deprecated_media_type");
    expect(result.current.message).toBe(
      "Anime and manga categories are deprecated while we revisit provider data quality.",
    );
    expect(result.current.allResults).toEqual([]);
  });

  it("only paginates successful, unfinished searches", () => {
    renderHook(() => useSearchResults({ query: "test", type: "movie", initialData: movieOutcome }));

    expect(capturedOptions!.getNextPageParam!(movieOutcome)).toBe(2);
    expect(capturedOptions!.getNextPageParam!({ ...movieOutcome, page: 2 })).toBeUndefined();
    expect(
      capturedOptions!.getNextPageParam!({
        status: "provider_unavailable",
        page: 1,
        message: "unavailable",
      }),
    ).toBeUndefined();
  });
});
