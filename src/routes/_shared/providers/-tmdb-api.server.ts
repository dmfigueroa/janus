import { Effect } from "effect";
import { fetchJson, requireEnvVar } from "../-effect";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_API_ERROR = "TMDB API Error";

function buildTmdbSearchUrl(query: string, page: number, type: "movie" | "tv"): URL {
  const endpoint = type === "movie" ? "search/movie" : "search/tv";
  const url = new URL(`${TMDB_BASE_URL}/${endpoint}`);

  url.searchParams.set("query", query);
  url.searchParams.set("page", page.toString());
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("language", "en-US");

  return url;
}

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

function fetchWithAuth(url: string): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const apiKey = yield* requireEnvVar("TMDB_API_KEY");
    const result = yield* fetchJson({
      url,
      init: {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          accept: "application/json",
        },
      },
      context: TMDB_API_ERROR,
    });
    return result;
  });
}

export function fetchFromTMDB(
  query: string,
  page: number,
  type: "movie" | "tv",
): Effect.Effect<TMDBSearchResponse, Error> {
  return Effect.gen(function* () {
    const url = buildTmdbSearchUrl(query, page, type);
    const response = (yield* fetchWithAuth(url.toString())) as unknown as TMDBSearchResponse;
    return {
      ...response,
      results: response.results.map((item) => ({
        ...item,
        media_type: item.media_type || type,
      })),
    };
  });
}

export function getTVDetails(id: number): Effect.Effect<unknown, Error> {
  const url = new URL(`${TMDB_BASE_URL}/tv/${id}`);
  return fetchWithAuth(url.toString());
}

export function getSeasonDetails(id: number, seasonNumber: number): Effect.Effect<unknown, Error> {
  const url = new URL(`${TMDB_BASE_URL}/tv/${id}/season/${seasonNumber}`);
  return fetchWithAuth(url.toString());
}

export function getMovieDetails(id: number): Effect.Effect<unknown, Error> {
  const url = new URL(`${TMDB_BASE_URL}/movie/${id}`);
  return fetchWithAuth(url.toString());
}
