import { beforeEach, describe, expect, it, vi } from "vitest";
import { Effect } from "effect";
import { getGameDetails, searchGames } from "./-rawg.server";

vi.stubGlobal("fetch", vi.fn());

describe("rawg provider", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("maps zero ratings without dropping them", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 1,
            name: "Test Game",
            background_image: null,
            released: "2020-01-01",
            rating: 0,
          },
        ],
        count: 1,
      }),
    } as Response);

    const result = await Effect.runPromise(searchGames("Test", "rawg-key", 1));

    expect(result.totalResults).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].rating).toBe(0);
  });

  it("encodes details id to avoid path traversal", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 1,
        name: "Test Game",
        background_image: null,
      }),
    } as Response);

    await Effect.runPromise(getGameDetails("../games/other-endpoint", "rawg-key"));

    expect(fetch).toHaveBeenCalledWith(
      "https://api.rawg.io/api/games/..%2Fgames%2Fother-endpoint?key=rawg-key",
    );
  });
});
