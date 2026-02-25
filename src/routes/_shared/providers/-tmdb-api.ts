import { createServerFn } from "@tanstack/react-start";
import { Effect } from "effect";
import { z } from "zod";
import { fetchJson, requireEnvVar, runServerEffect } from "../-effect";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

export interface TMDBMedia {
  id: number;
  media_type?: "movie" | "tv";
  title?: string;
  name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  overview: string;
}

export interface TMDBSearchResponse {
  page: number;
  results: TMDBMedia[];
  total_pages: number;
  total_results: number;
}

async function fetchWithAuth(url: string): Promise<any> {
  const program = Effect.gen(function* () {
    const apiKey = yield* requireEnvVar("TMDB_API_KEY");
    return yield* fetchJson({
      url,
      init: {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          accept: "application/json",
        },
      },
      context: "TMDB API Error",
    });
  });

  return runServerEffect(program);
}

export const fetchFromTMDB = createServerFn({ method: "GET" })
  .inputValidator((data) =>
    z
      .object({
        query: z.string(),
        page: z.number(),
        type: z.enum(["movie", "tv"]),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { query, page, type } = data;
    const endpoint = type === "movie" ? "search/movie" : "search/tv";
    const url = new URL(`${TMDB_BASE_URL}/${endpoint}`);

    url.searchParams.set("query", query);
    url.searchParams.set("page", page.toString());
    url.searchParams.set("include_adult", "false");
    url.searchParams.set("language", "en-US");

    const response = (await fetchWithAuth(url.toString())) as unknown as TMDBSearchResponse;

    response.results = response.results.map((item) => ({
      ...item,
      media_type: item.media_type || type,
    }));

    return response;
  });

export const getTVDetails = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ id: z.number() }).parse(data))
  .handler(async ({ data }) => {
    const url = new URL(`${TMDB_BASE_URL}/tv/${data.id}`);
    return fetchWithAuth(url.toString());
  });

export const getSeasonDetails = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ id: z.number(), seasonNumber: z.number() }).parse(data))
  .handler(async ({ data }) => {
    const url = new URL(`${TMDB_BASE_URL}/tv/${data.id}/season/${data.seasonNumber}`);
    return fetchWithAuth(url.toString());
  });

export const getMovieDetails = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ id: z.number() }).parse(data))
  .handler(async ({ data }) => {
    const url = new URL(`${TMDB_BASE_URL}/movie/${data.id}`);
    return fetchWithAuth(url.toString());
  });
