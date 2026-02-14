import { describe, it, expect, vi, beforeEach } from "vitest";
import { getBookDetails } from "./google-books";

vi.stubGlobal("fetch", vi.fn());

describe("google-books getBookDetails", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.GOOGLE_BOOKS_API_KEY = "test-api-key";
  });

  it("should construct the correct URL for a valid ID (Positive Test)", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "zyTCAlFPjgYC",
        volumeInfo: {
          title: "Test Book",
        },
      }),
    } as Response);

    await getBookDetails("zyTCAlFPjgYC");

    expect(fetch).toHaveBeenCalledWith(
      "https://www.googleapis.com/books/v1/volumes/zyTCAlFPjgYC?key=test-api-key",
    );
  });

  it("should encode malicious ID to prevent path traversal/injection (Negative Test/Security)", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "id",
        volumeInfo: {},
      }),
    } as Response);

    const maliciousId = "../volumes/other-endpoint";
    await getBookDetails(maliciousId);

    const calledUrl = vi.mocked(fetch).mock.calls[0][0];
    const urlObj = new URL(calledUrl as string);

    // If encoded, the .. and / should be escaped
    // The path should be /books/v1/volumes/..%2Fvolumes%2Fother-endpoint
    expect(urlObj.pathname).toBe("/books/v1/volumes/..%2Fvolumes%2Fother-endpoint");
    // It should NOT be normalized to /books/v1/volumes/other-endpoint
    expect(urlObj.pathname).not.toBe("/books/v1/volumes/other-endpoint");

    // Full URL check including API key
    expect(fetch).toHaveBeenCalledWith(
      "https://www.googleapis.com/books/v1/volumes/..%2Fvolumes%2Fother-endpoint?key=test-api-key",
    );
  });
});
