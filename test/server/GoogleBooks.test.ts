import { describe, it, expect, vi, beforeEach } from "vitest";
import { getBookDetails, searchBooks } from "@/server/providers/GoogleBooks.server";

vi.stubGlobal("fetch", vi.fn());

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function getFetchedUrl(call: unknown[]) {
  const input = call[0] as Request | string | URL;
  return input instanceof Request ? input.url : input.toString();
}

describe("google-books searchBooks", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.GOOGLE_BOOKS_API_KEY = "test-api-key";
  });

  it("forwards cancellation from the adapter to the shared transport", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(searchBooks("test query", 1, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("should return authors from API response", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        totalItems: 1,
        items: [
          {
            id: "book123",
            volumeInfo: {
              title: "Test Book",
              authors: ["Author One", "Author Two"],
              publishedDate: "2024",
              imageLinks: { thumbnail: "http://example.com/cover.jpg" },
            },
          },
        ],
      }),
    );

    const result = await searchBooks("test query");

    expect(result.results).toHaveLength(1);
    expect(result.results[0].authors).toEqual(["Author One", "Author Two"]);
  });
});

describe("google-books getBookDetails", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.GOOGLE_BOOKS_API_KEY = "test-api-key";
  });

  it("should construct the correct URL for a valid ID (Positive Test)", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        id: "zyTCAlFPjgYC",
        volumeInfo: {
          title: "Test Book",
        },
      }),
    );

    await getBookDetails("zyTCAlFPjgYC");

    expect(getFetchedUrl(vi.mocked(fetch).mock.calls[0] ?? [])).toBe(
      "https://www.googleapis.com/books/v1/volumes/zyTCAlFPjgYC?key=test-api-key",
    );
  });

  it("should encode malicious ID to prevent path traversal/injection (Negative Test/Security)", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        id: "id",
        volumeInfo: {},
      }),
    );

    const maliciousId = "../volumes/other-endpoint";
    await getBookDetails(maliciousId);

    const urlObj = new URL(getFetchedUrl(vi.mocked(fetch).mock.calls[0] ?? []));

    // If encoded, the .. and / should be escaped
    // The path should be /books/v1/volumes/..%2Fvolumes%2Fother-endpoint
    expect(urlObj.pathname).toBe("/books/v1/volumes/..%2Fvolumes%2Fother-endpoint");
    // It should NOT be normalized to /books/v1/volumes/other-endpoint
    expect(urlObj.pathname).not.toBe("/books/v1/volumes/other-endpoint");

    // Full URL check including API key
    expect(urlObj.toString()).toBe(
      "https://www.googleapis.com/books/v1/volumes/..%2Fvolumes%2Fother-endpoint?key=test-api-key",
    );
  });

  it("should return authors from API response", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        id: "book123",
        volumeInfo: {
          title: "Test Book",
          authors: ["Single Author"],
          publishedDate: "2024",
        },
      }),
    );

    const result = await getBookDetails("book123");

    expect(result.authors).toEqual(["Single Author"]);
  });
});
