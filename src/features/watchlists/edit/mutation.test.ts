import { describe, expect, it } from "vitest";
import { editWatchlistItemSchema } from "./mutation";

describe("edit watchlist item validation", () => {
  const baseInput = { watchlistId: 1, itemId: 2, title: "Movie" };

  it("accepts complete calendar dates and an explicitly cleared date", () => {
    expect(
      editWatchlistItemSchema.safeParse({ ...baseInput, releaseDate: "2025-02-03" }).success,
    ).toBe(true);
    expect(editWatchlistItemSchema.safeParse({ ...baseInput, releaseDate: null }).success).toBe(
      true,
    );
  });

  it("rejects year-only and impossible calendar dates", () => {
    expect(editWatchlistItemSchema.safeParse({ ...baseInput, releaseDate: "2025" }).success).toBe(
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
