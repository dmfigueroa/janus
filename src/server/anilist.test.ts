import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchAnilistInternal, getAnilistDetailsInternal } from "./anilist";

vi.stubGlobal("fetch", vi.fn());

describe("anilist integration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should search for anime correctly", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          Page: {
            pageInfo: { total: 1 },
            media: [
              {
                id: 1,
                title: { english: "Cowboy Bebop", romaji: "Cowboy Bebop" },
                type: "ANIME",
                description: "Space cowboys",
                startDate: { year: 1998 },
                averageScore: 86,
                coverImage: { large: "large.jpg", extraLarge: "extraLarge.jpg" },
                bannerImage: "banner.jpg",
              },
            ],
          },
        },
      }),
    } as Response);

    const result = await searchAnilistInternal("Cowboy Bebop", "ANIME", 1);

    expect(result.results[0].title).toBe("Cowboy Bebop");
    expect(result.results[0].mediaType).toBe("anime");
    expect(fetch).toHaveBeenCalledWith(
      "https://graphql.anilist.co",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"search":"Cowboy Bebop"'),
      }),
    );
  });

  it("should get anime details correctly", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          Media: {
            id: 1,
            title: { english: "Cowboy Bebop", romaji: "Cowboy Bebop" },
            type: "ANIME",
            description: "Space cowboys",
            startDate: { year: 1998, month: 4, day: 3 },
            averageScore: 86,
            coverImage: { large: "large.jpg", extraLarge: "extraLarge.jpg" },
            bannerImage: "banner.jpg",
            episodes: 26,
          },
        },
      }),
    } as Response);

    const result = await getAnilistDetailsInternal("1");

    expect(result.title).toBe("Cowboy Bebop");
    expect(result.episodes).toBe(26);
    expect(result.releaseDate).toBe("1998-04-03");
  });
});
