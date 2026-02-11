import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchFromTMDBHandler } from "./tmdb-api";
import type { TMDBSearchResponse } from "./tmdb-api";

describe("fetchFromTMDB Benchmark", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TMDB_API_KEY = "test_api_key";
  });

  it("should cache results for the same query", async () => {
    const mockResponse: TMDBSearchResponse = {
      page: 1,
      results: [],
      total_pages: 1,
      total_results: 0,
    };

    const fetchMock = vi.fn().mockImplementation(async () => {
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 100));
      return {
        ok: true,
        json: async () => mockResponse,
      };
    });

    global.fetch = fetchMock as any;

    const queryData = {
      query: "inception",
      page: 1,
      type: "movie" as const,
    };

    // First call (uncached)
    const start1 = performance.now();
    await fetchFromTMDBHandler(queryData);
    const end1 = performance.now();
    const duration1 = end1 - start1;

    // Second call (should be cached)
    const start2 = performance.now();
    await fetchFromTMDBHandler(queryData);
    const end2 = performance.now();
    const duration2 = end2 - start2;

    console.log(`Uncached duration: ${duration1.toFixed(2)}ms`);
    console.log(`Cached duration: ${duration2.toFixed(2)}ms`);

    // Verify fetch calls
    // Without cache, it should be called twice. With cache, only once.
    // We expect failure here initially if we assert strictly, so let's log it.
    console.log(`Fetch called ${fetchMock.mock.calls.length} times`);

    // For the baseline, we assert that fetch IS called twice to prove no cache exists.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
