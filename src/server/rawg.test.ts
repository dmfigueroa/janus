import { describe, it, expect, vi, beforeEach } from "vitest";
import { getGameDetails } from "./rawg";

describe("getGameDetails", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("should construct the correct URL for a valid game ID", async () => {
    const mockGame = {
      id: 3498,
      name: "Grand Theft Auto V",
      background_image: "https://example.com/image.jpg",
      released: "2013-09-17",
      rating: 4.47,
    };

    (vi.mocked(fetch) as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockGame,
    });

    const result = await getGameDetails("3498", "test-api-key");

    expect(fetch).toHaveBeenCalledWith(
      "https://api.rawg.io/api/games/3498?key=test-api-key"
    );
    expect(result.title).toBe("Grand Theft Auto V");
  });

  it("should encode the ID to prevent path traversal", async () => {
    (vi.mocked(fetch) as any).mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    try {
      await getGameDetails("../developers", "test-api-key");
    } catch {
      // Expected
    }

    // encodeURIComponent does not encode '.', but it encodes '/'
    expect(fetch).toHaveBeenCalledWith(
      "https://api.rawg.io/api/games/..%2Fdevelopers?key=test-api-key"
    );
  });

  it("should encode the ID to prevent parameter injection", async () => {
    (vi.mocked(fetch) as any).mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    try {
      await getGameDetails("1?exclude=", "test-api-key");
    } catch {
      // Expected
    }

    expect(fetch).toHaveBeenCalledWith(
      "https://api.rawg.io/api/games/1%3Fexclude%3D?key=test-api-key"
    );
  });
});
