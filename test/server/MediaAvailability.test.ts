import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEPRECATED_MEDIA_MESSAGE,
  getDeprecatedWatchlistAddRejection,
  isDeprecatedMediaType,
} from "@/server/Media";
import {
  getDeprecatedMediaSearchPage,
  PROVIDER_UNAVAILABLE_MESSAGE,
  searchMedia,
} from "@/features/search/search/MediaSearch.server";

vi.stubGlobal("fetch", vi.fn());

describe("deprecated media behavior", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.RAWG_API_KEY = "test-rawg-key";
    process.env.GOOGLE_BOOKS_API_KEY = "test-google-books-key";
    process.env.COMICVINE_API_KEY = "test-comicvine-key";
  });
  it("marks anime and manga types as deprecated", () => {
    expect(isDeprecatedMediaType("anime")).toBe(true);
    expect(isDeprecatedMediaType("manga")).toBe(true);
    expect(isDeprecatedMediaType("movie")).toBe(false);
  });

  it("builds graceful search rejections for deprecated media types", () => {
    const animeResult = getDeprecatedMediaSearchPage("anime", 1);
    const mangaResult = getDeprecatedMediaSearchPage("manga", 2);
    const movieResult = getDeprecatedMediaSearchPage("movie", 1);

    expect(movieResult).toBeNull();
    expect(animeResult).not.toBeNull();
    expect(mangaResult).not.toBeNull();
    if (!animeResult || !mangaResult) {
      throw new Error("Expected deprecated search responses for anime and manga");
    }
    expect(animeResult.rejected).toBe(true);
    expect(mangaResult.rejected).toBe(true);
    expect(animeResult.message).toBe(DEPRECATED_MEDIA_MESSAGE);
    expect(mangaResult.message).toBe(DEPRECATED_MEDIA_MESSAGE);
    expect(animeResult.results).toHaveLength(0);
    expect(mangaResult.results).toHaveLength(0);
    expect(mangaResult.page).toBe(2);
  });

  it("builds graceful add rejections for deprecated media types", () => {
    const animeAdd = getDeprecatedWatchlistAddRejection("anime");
    const mangaAdd = getDeprecatedWatchlistAddRejection("manga");
    const comicAdd = getDeprecatedWatchlistAddRejection("comic");

    expect(comicAdd).toBeNull();
    if (!animeAdd || !mangaAdd) {
      throw new Error("Expected deprecated add rejections for anime and manga");
    }
    expect(animeAdd.success).toBe(false);
    expect(mangaAdd.success).toBe(false);
    expect(animeAdd.message).toContain(DEPRECATED_MEDIA_MESSAGE);
    expect(mangaAdd.message).toContain(DEPRECATED_MEDIA_MESSAGE);
  });

  it("maps provider failures to a structured unavailable search page", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("Provider unavailable", { status: 503 }));

    const searchPages = await Promise.all(
      (["game", "book", "comic"] as const).map((mediaType) =>
        searchMedia({ query: "test", mediaType, page: 1 }),
      ),
    );

    expect(searchPages).toEqual(
      Array.from({ length: 3 }, () => ({
        results: [],
        page: 1,
        total_pages: 1,
        total_results: 0,
        rejected: true,
        message: PROVIDER_UNAVAILABLE_MESSAGE,
      })),
    );
  });
});
