import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  searchAnilistInternal,
  getAnilistDetailsInternal,
} from "@/server/providers/Anilist.server";

vi.stubGlobal("fetch", vi.fn());

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("anilist integration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should search for anime correctly", async () => {
    let sentBody: unknown;
    vi.mocked(fetch).mockImplementation(async (input) => {
      sentBody = input instanceof Request ? await input.clone().json() : undefined;
      return jsonResponse({
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
      });
    });

    const result = await searchAnilistInternal("Cowboy Bebop", "ANIME", 1);

    expect(result.results[0].title).toBe("Cowboy Bebop");
    expect(result.results[0].mediaType).toBe("anime");

    const request = vi.mocked(fetch).mock.calls[0]?.[0] as Request;
    expect(request.url).toBe("https://graphql.anilist.co/");
    expect(request.method).toBe("POST");
    expect(sentBody).toMatchObject({
      variables: { search: "Cowboy Bebop" },
    });
  });

  it("retries the read-only GraphQL POST explicitly", async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            Page: { pageInfo: { total: 0 }, media: [] },
          },
        }),
      );

    const result = await searchAnilistInternal("anything", "ANIME", 1);

    expect(result).toEqual({ results: [], totalResults: 0 });
    expect(fetch).toHaveBeenCalledTimes(2);
    const secondRequest = vi.mocked(fetch).mock.calls[1]?.[0];
    expect(secondRequest).toBeInstanceOf(Request);
    expect((secondRequest as Request).method).toBe("POST");
  });

  it("should get anime details correctly", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
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
    );

    const result = await getAnilistDetailsInternal("1");

    expect(result.title).toBe("Cowboy Bebop");
    expect(result.episodes).toBe(26);
    expect(result.releaseDate).toBe("1998-04-03");
  });
});
