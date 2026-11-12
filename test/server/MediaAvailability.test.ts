import { describe, expect, it } from "vitest";
import {
  DEPRECATED_MEDIA_MESSAGE,
  getDeprecatedWatchlistAddRejection,
  isDeprecatedMediaType,
} from "@/server/Media";

describe("deprecated media behavior", () => {
  it("marks anime and manga types as deprecated", () => {
    expect(isDeprecatedMediaType("anime")).toBe(true);
    expect(isDeprecatedMediaType("manga")).toBe(true);
    expect(isDeprecatedMediaType("movie")).toBe(false);
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
