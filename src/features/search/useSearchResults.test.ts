// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const searchUnifiedFnMock = vi.fn();

vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => searchUnifiedFnMock,
}));

let capturedQueryFn: ((ctx: { pageParam: number }) => Promise<unknown>) | undefined;

const mockReturn = {
  data: undefined as { pages: unknown[]; pageParams: unknown[] } | undefined,
  fetchNextPage: vi.fn(),
  hasNextPage: false,
  isFetchingNextPage: false,
};

vi.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: (options: { queryFn: typeof capturedQueryFn }) => {
    capturedQueryFn = options.queryFn;
    return mockReturn;
  },
}));

vi.mock("@/server/search", () => ({
  searchUnified: vi.fn(),
}));

vi.mock("@/server/media", () => ({
  DEPRECATED_MEDIA_MESSAGE:
    "Anime and manga categories are deprecated while we revisit provider data quality.",
  isDeprecatedMediaType: (t: string) => t === "anime" || t === "manga",
}));

import { useSearchResults } from "./useSearchResults";

describe("useSearchResults", () => {
  beforeEach(() => {
    searchUnifiedFnMock.mockReset();
    capturedQueryFn = undefined;
    mockReturn.data = undefined;
  });

  it("returns empty page when query is empty", async () => {
    renderHook(() =>
      useSearchResults({
        query: "",
        type: "movie",
        initialData: { results: [], page: 1, total_pages: 1, total_results: 0 },
      }),
    );

    expect(capturedQueryFn).toBeDefined();
    const result = await capturedQueryFn!({ pageParam: 1 });
    expect(result).toEqual({
      results: [],
      page: 1,
      total_pages: 1,
      total_results: 0,
    });
    expect(searchUnifiedFnMock).not.toHaveBeenCalled();
  });

  it("returns deprecated page for anime/manga types", async () => {
    renderHook(() =>
      useSearchResults({
        query: "naruto",
        type: "anime",
        initialData: { results: [], page: 1, total_pages: 1, total_results: 0 },
      }),
    );

    const result = await capturedQueryFn!({ pageParam: 2 });
    expect(result).toEqual({
      results: [],
      page: 2,
      total_pages: 1,
      total_results: 0,
      rejected: true,
      message: "Anime and manga categories are deprecated while we revisit provider data quality.",
    });
    expect(searchUnifiedFnMock).not.toHaveBeenCalled();
  });

  it("calls searchUnifiedFn for valid types with a query", async () => {
    searchUnifiedFnMock.mockResolvedValue({
      results: [{ id: "1", title: "Star Wars" }],
      page: 1,
      total_pages: 1,
      total_results: 1,
    });

    renderHook(() =>
      useSearchResults({
        query: "star wars",
        type: "movie",
        initialData: { results: [], page: 1, total_pages: 1, total_results: 0 },
      }),
    );

    await capturedQueryFn!({ pageParam: 1 });
    expect(searchUnifiedFnMock).toHaveBeenCalledWith({
      data: { query: "star wars", page: 1, type: "movie" },
    });
  });

  it("computes allResults from paginated data", () => {
    mockReturn.data = {
      pages: [
        {
          results: [{ id: "1", title: "A" }],
          page: 1,
          total_pages: 2,
          total_results: 2,
        },
        {
          results: [{ id: "2", title: "B" }],
          page: 2,
          total_pages: 2,
          total_results: 2,
        },
      ],
      pageParams: [1, 2],
    };

    const { result } = renderHook(() =>
      useSearchResults({
        query: "test",
        type: "book",
        initialData: { results: [], page: 1, total_pages: 2, total_results: 2 },
      }),
    );

    expect(result.current.allResults).toHaveLength(2);
    expect(result.current.allResults[0].title).toBe("A");
    expect(result.current.allResults[1].title).toBe("B");
  });
});
