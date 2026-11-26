import { describe, expect, it } from "vitest";
import { addToWatchlistSchema } from "@/features/watchlists/add/Mutation";

const storedIds = [
  { source: "rawg", mediaType: "game", id: "3498" },
  { source: "google_books", mediaType: "book", id: "zyTCAlFPjgYC" },
  { source: "google_books", mediaType: "book", id: "book-42" },
  { source: "comicvine", mediaType: "comic", id: "4050" },
  { source: "tmdb", mediaType: "movie", id: "550" },
  { source: "custom", mediaType: "movie", id: "custom-movie-1" },
] as const;

const adversarialIds = [
  { source: "rawg", mediaType: "game", id: ".." },
  { source: "rawg", mediaType: "game", id: "1?key=x" },
  { source: "rawg", mediaType: "game", id: "123,name:bar" },
  { source: "google_books", mediaType: "book", id: ".." },
  { source: "google_books", mediaType: "book", id: "../foo" },
  { source: "google_books", mediaType: "book", id: "?key=x" },
  { source: "google_books", mediaType: "book", id: "../volumes/other-endpoint" },
  { source: "comicvine", mediaType: "comic", id: ".." },
  { source: "comicvine", mediaType: "comic", id: "123,name:bar" },
  { source: "tmdb", mediaType: "movie", id: ".." },
  { source: "tmdb", mediaType: "tv", id: "0" },
] as const;

function addition(media: { source: string; mediaType: string; id: string }) {
  return {
    watchlistId: 1,
    media: {
      id: media.id,
      source: media.source,
      mediaType: media.mediaType,
      title: "Title",
      poster: null,
    },
  };
}

describe("addToWatchlistSchema provider ids", () => {
  it.each(storedIds)("accepts stored $source id $id", (media) => {
    expect(addToWatchlistSchema.safeParse(addition(media)).success).toBe(true);
  });

  it.each(adversarialIds)("rejects adversarial $source id $id", (media) => {
    const result = addToWatchlistSchema.safeParse(addition(media));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("id"))).toBe(true);
    }
  });
});
