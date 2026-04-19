import { describe, it, expect } from "vitest";
import {
  DEPRECATED_MEDIA_MESSAGE,
  getDeprecatedWatchlistAddRejection,
  isDeprecatedMediaType,
} from "./media";
import { getDeprecatedSearchResponse } from "./search";

describe("deprecated media behavior", () => {
  it("marks anime and manga types as deprecated", () => {
    expect(isDeprecatedMediaType("anime")).toBe(true);
    expect(isDeprecatedMediaType("manga")).toBe(true);
    expect(isDeprecatedMediaType("movie")).toBe(false);
  });

  it("builds graceful search rejections for deprecated media types", () => {
    const animeResult = getDeprecatedSearchResponse("anime", 1);
    const mangaResult = getDeprecatedSearchResponse("manga", 2);
    const movieResult = getDeprecatedSearchResponse("movie", 1);

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
});
