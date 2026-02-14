import { describe, it, expect, vi, beforeEach } from "vitest";
import { getBookDetails } from "./google-books";

vi.stubGlobal("fetch", vi.fn());

describe("google-books getBookDetails", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.GOOGLE_BOOKS_API_KEY = "test-api-key";
  });

  it("should construct the correct URL for a valid ID (Positive Test)", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "zyTCAlFPjgYC",
        volumeInfo: {
          title: "Test Book",
        },
      }),
    });

    await getBookDetails("zyTCAlFPjgYC");

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("https://www.googleapis.com/books/v1/volumes/zyTCAlFPjgYC"),
    );
  });

  it("should encode malicious ID to prevent path traversal/injection (Negative Test/Security)", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "id",
        volumeInfo: {},
      }),
    });

    const maliciousId = "../volumes/other-endpoint";
    await getBookDetails(maliciousId);

    const calledUrl = (fetch as any).mock.calls[0][0];
    const urlObj = new URL(calledUrl);

    // If encoded, the .. and / should be escaped
    // The path should be /books/v1/volumes/..%2Fvolumes%2Fother-endpoint
    expect(urlObj.pathname).toBe("/books/v1/volumes/..%2Fvolumes%2Fother-endpoint");
    // It should NOT be normalized to /books/v1/volumes/other-endpoint
    expect(urlObj.pathname).not.toBe("/books/v1/volumes/other-endpoint");
  });
});
