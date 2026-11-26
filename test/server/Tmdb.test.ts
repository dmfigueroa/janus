import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { ProviderRequestError } from "@/integrations/ProviderRequest.server";
import {
  fetchTmdbMovie,
  fetchTmdbSeason,
  fetchTmdbTv,
  searchMultimedia,
} from "@/server/providers/Tmdb.server";

vi.stubGlobal("fetch", vi.fn());

const fightClubSearch = {
  page: 1,
  total_pages: 1,
  total_results: 1,
  dates: { maximum: "2026-11-26", minimum: "2026-01-01" },
  results: [
    {
      id: 550,
      title: "Fight Club",
      name: "Unused show title",
      poster_path: "/poster.jpg",
      backdrop_path: "/backdrop.jpg",
      release_date: "1999-10-15",
      first_air_date: "1998-01-01",
      vote_average: 8.4,
      overview: "An insomniac office worker.",
      adult: false,
      genre_ids: [18],
      original_language: "en",
      popularity: 50.1,
    },
  ],
};

const detailCases = [
  {
    label: "movie 550",
    body: { title: "Fight Club", poster_path: "/poster.jpg" },
    request: () => fetchTmdbMovie({ id: 550 }),
    invalidRequest: (id: number) => fetchTmdbMovie({ id }),
    url: "https://api.themoviedb.org/3/movie/550",
  },
  {
    label: "tv 1399",
    body: { name: "Canonical Show", poster_path: null, seasons: [{ season_number: 1 }] },
    request: () => fetchTmdbTv({ id: 1399 }),
    invalidRequest: (id: number) => fetchTmdbTv({ id }),
    url: "https://api.themoviedb.org/3/tv/1399",
  },
  {
    label: "season 1 of 1399",
    body: { episodes: [] },
    request: () => fetchTmdbSeason({ id: 1399, seasonNumber: 1 }),
    invalidRequest: (id: number) => fetchTmdbSeason({ id, seasonNumber: 1 }),
    url: "https://api.themoviedb.org/3/tv/1399/season/1",
  },
];

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

function isRejectedProviderId(error: unknown) {
  return error instanceof ZodError || error instanceof ProviderRequestError;
}

describe("tmdb search", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.TMDB_API_KEY = "test-api-key";
  });

  it("rejects a search payload that omits results", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ page: 1 }));

    await expect(
      searchMultimedia({ query: "fight club", page: 1, type: "movie" }),
    ).rejects.toBeInstanceOf(ProviderRequestError);
  });

  it("maps a search payload that includes unknown keys", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(fightClubSearch));

    await expect(
      searchMultimedia({ query: "fight club", page: 1, type: "movie" }),
    ).resolves.toEqual({
      page: 1,
      total_pages: 1,
      total_results: 1,
      results: [
        {
          id: "550",
          mediaType: "movie",
          source: "tmdb",
          title: "Fight Club",
          poster: "https://image.tmdb.org/t/p/w500/poster.jpg",
          backdrop: "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
          year: "1999",
          releaseDate: "1999-10-15",
          rating: 8.4,
          overview: "An insomniac office worker.",
        },
      ],
    });
  });
});

describe("tmdb details", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.TMDB_API_KEY = "test-api-key";
  });

  it.each(detailCases)("loads $label", async ({ request, body, url }) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(body));

    await expect(request()).resolves.toMatchObject(body);
    expect(getFetchedUrl(vi.mocked(fetch).mock.calls[0] ?? [])).toBe(url);
  });

  it.each(detailCases)("rejects a negative id for $label before calling TMDB", async (detail) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(detail.body));

    await expect(detail.invalidRequest(-1)).rejects.toSatisfy(isRejectedProviderId);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(detailCases)(
    "rejects a non-integer id for $label before calling TMDB",
    async (detail) => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(detail.body));

      await expect(detail.invalidRequest(1.5)).rejects.toSatisfy(isRejectedProviderId);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([-1, 1.5])("rejects season number %s before calling TMDB", async (seasonNumber) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ episodes: [] }));

    await expect(fetchTmdbSeason({ id: 1399, seasonNumber })).rejects.toSatisfy(
      isRejectedProviderId,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
