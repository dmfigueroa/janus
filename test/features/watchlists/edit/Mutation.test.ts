import { describe, expect, it } from "vitest";
import { editWatchlistItemSchema } from "@/features/watchlists/edit/Mutation";

describe("edit watchlist item validation", () => {
  const baseInput = { watchlistId: 1, itemId: 2, title: "Movie", posterPath: null };

  it("accepts an edit with only the title", () => {
    expect(
      editWatchlistItemSchema.safeParse({ watchlistId: 1, itemId: 2, title: "Movie" }).success,
    ).toBe(true);
  });

  it("rejects an edit with no editable fields", () => {
    const result = editWatchlistItemSchema.safeParse({ watchlistId: 1, itemId: 2 });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe("No fields to update.");
  });

  it("accepts a full HTTPS poster image URL", () => {
    const result = editWatchlistItemSchema.safeParse({
      ...baseInput,
      releaseDate: null,
      posterPath: "https://images.example.com/posters/movie.jpg",
    });

    expect(result).toMatchObject({
      success: true,
      data: { posterPath: "https://images.example.com/posters/movie.jpg" },
    });
  });

  it("accepts a provider poster image path", () => {
    const result = editWatchlistItemSchema.safeParse({
      ...baseInput,
      releaseDate: null,
      posterPath: "/provider/movie-poster.jpg",
    });

    expect(result).toMatchObject({
      success: true,
      data: { posterPath: "/provider/movie-poster.jpg" },
    });
  });

  it("rejects an HTTP poster image URL with a useful error", () => {
    const result = editWatchlistItemSchema.safeParse({
      ...baseInput,
      releaseDate: null,
      posterPath: "http://images.example.com/posters/movie.jpg",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.posterPath).toEqual([
        "Poster image must be an HTTPS URL or a provider path beginning with /.",
      ]);
    }
  });

  it("rejects a data poster image URL with a useful error", () => {
    const result = editWatchlistItemSchema.safeParse({
      ...baseInput,
      releaseDate: null,
      posterPath: "data:image/png;base64,aW1hZ2U=",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.posterPath).toEqual([
        "Poster image must be an HTTPS URL or a provider path beginning with /.",
      ]);
    }
  });

  it("accepts year-only dates, complete calendar dates, and an explicitly cleared date", () => {
    expect(editWatchlistItemSchema.safeParse({ ...baseInput, releaseDate: "2025" }).success).toBe(
      true,
    );
    expect(
      editWatchlistItemSchema.safeParse({ ...baseInput, releaseDate: "2025-02-03" }).success,
    ).toBe(true);
    expect(editWatchlistItemSchema.safeParse({ ...baseInput, releaseDate: null }).success).toBe(
      true,
    );
  });

  it("rejects malformed and impossible calendar dates", () => {
    expect(editWatchlistItemSchema.safeParse({ ...baseInput, releaseDate: "25" }).success).toBe(
      false,
    );
    expect(
      editWatchlistItemSchema.safeParse({ ...baseInput, releaseDate: "2025-02-29" }).success,
    ).toBe(false);
  });

  it("rejects titles that are empty after trimming", () => {
    expect(editWatchlistItemSchema.safeParse({ ...baseInput, title: "   " }).success).toBe(false);
  });
});
