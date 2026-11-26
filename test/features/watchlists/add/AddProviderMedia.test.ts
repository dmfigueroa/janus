import { describe, expect, it } from "vitest";
import { providerMediaAdditionSchema } from "@/features/watchlists/add/AddProviderMedia";

const storedProviderIds = [
  { provider: "rawg", mediaType: "game", providerId: "3498" },
  { provider: "google_books", mediaType: "book", providerId: "zyTCAlFPjgYC" },
  { provider: "google_books", mediaType: "book", providerId: "book-42" },
  { provider: "google_books", mediaType: "book", providerId: "book-1" },
  { provider: "comicvine", mediaType: "comic", providerId: "4050" },
  { provider: "comicvine", mediaType: "comic_issue", providerId: "9001" },
  { provider: "anilist", mediaType: "anime", providerId: "21" },
] as const;

const adversarialProviderIds = [
  { provider: "rawg", mediaType: "game", providerId: ".." },
  { provider: "rawg", mediaType: "game", providerId: "1?key=x" },
  { provider: "rawg", mediaType: "game", providerId: "123,name:bar" },
  { provider: "google_books", mediaType: "book", providerId: ".." },
  { provider: "google_books", mediaType: "book", providerId: "../foo" },
  { provider: "google_books", mediaType: "book", providerId: "?key=x" },
  { provider: "google_books", mediaType: "book", providerId: "../volumes/other-endpoint" },
  { provider: "comicvine", mediaType: "comic", providerId: ".." },
  { provider: "comicvine", mediaType: "comic", providerId: "123,name:bar" },
  { provider: "comicvine", mediaType: "comic_issue", providerId: ".." },
  { provider: "comicvine", mediaType: "comic_issue", providerId: "123,name:bar" },
  { provider: "anilist", mediaType: "anime", providerId: ".." },
  { provider: "anilist", mediaType: "manga", providerId: "1?key=x" },
] as const;

describe("provider media addition ids", () => {
  it.each(storedProviderIds)("accepts stored $provider id $providerId", (addition) => {
    expect(providerMediaAdditionSchema.safeParse({ watchlistId: 1, ...addition }).success).toBe(
      true,
    );
  });

  it.each(adversarialProviderIds)(
    "rejects adversarial $provider $mediaType id $providerId",
    (addition) => {
      const result = providerMediaAdditionSchema.safeParse({ watchlistId: 1, ...addition });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.path.includes("providerId"))).toBe(true);
      }
    },
  );
});
