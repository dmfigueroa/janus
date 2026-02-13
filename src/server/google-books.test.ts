import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { searchBooksInternal } from "./google-books";
import { cacheDb } from "@/db/cache";
import { apiCache } from "@/db/cache-schema";
import { like } from "drizzle-orm";

describe("Google Books Internal Logic", () => {
  const query = "test-book";

  beforeEach(async () => {
    // Clean up cache for this test
    await cacheDb.delete(apiCache).where(like(apiCache.key, `google-books-search-${query}-%`));

    // Mock environment variable
    vi.stubEnv("GOOGLE_BOOKS_API_KEY", "test-api-key");

    // Mock global fetch
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("should fetch from API and cache the result", async () => {
    const mockResponse = {
      items: [
        {
          id: "1",
          volumeInfo: {
            title: "Test Book",
            imageLinks: { thumbnail: "http://example.com/image.jpg" },
            publishedDate: "2023-01-01",
            averageRating: 4.5,
            description: "Test description",
          },
        },
      ],
      totalItems: 1,
    };

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    // First call
    const result1 = await searchBooksInternal({ query, page: 1 });
    expect(result1.results).toHaveLength(1);
    expect(result1.results[0].title).toBe("Test Book");
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Second call - should use cache
    const result2 = await searchBooksInternal({ query, page: 1 });
    expect(result2.results).toHaveLength(1);
    expect(result2.results[0].title).toBe("Test Book");
    expect(global.fetch).toHaveBeenCalledTimes(1); // Still 1
  });

  it("should force refresh if requested", async () => {
    const mockResponse = {
        items: [],
        totalItems: 0
    };
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    // Call once to populate cache
    await searchBooksInternal({ query, page: 1 });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Call again with forceRefresh
    await searchBooksInternal({ query, page: 1, forceRefresh: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
