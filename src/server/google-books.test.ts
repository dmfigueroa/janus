import { describe, it, expect, vi, beforeEach } from "vitest";
import { getBookDetails } from "./google-books";

describe("getBookDetails", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.GOOGLE_BOOKS_API_KEY = "test-api-key";
  });

  it("should construct the correct URL for a valid book ID", async () => {
    const mockBook = {
      id: "test-id",
      volumeInfo: {
        title: "Test Book",
      },
    };

    (vi.mocked(fetch) as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockBook,
    });

    const result = await getBookDetails("test-id");

    expect(fetch).toHaveBeenCalledWith(
      "https://www.googleapis.com/books/v1/volumes/test-id?key=test-api-key"
    );
    expect(result.title).toBe("Test Book");
  });

  it("should encode the ID to prevent path traversal", async () => {
    (vi.mocked(fetch) as any).mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    try {
      await getBookDetails("../volumes");
    } catch {
      // Expected
    }

    expect(fetch).toHaveBeenCalledWith(
      "https://www.googleapis.com/books/v1/volumes/..%2Fvolumes?key=test-api-key"
    );
  });
});
