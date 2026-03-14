import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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

export interface TMDBMovieDetails extends TMDBMedia {
  runtime?: number | null;
}

export interface TMDBSeason {
  season_number: number;
  episode_count?: number | null;
}

export interface TMDBTVDetails {
  poster_path: string | null;
  seasons?: TMDBSeason[];
}

export interface TMDBEpisode {
  id: number;
  name: string;
  season_number: number;
  episode_number: number;
  still_path: string | null;
  air_date?: string;
  vote_average: number;
  runtime?: number | null;
}

export interface TMDBSeasonDetails {
  episodes?: TMDBEpisode[];
}

export interface TMDBSearchResponse {
  page: number;
  results: TMDBMedia[];
  total_pages: number;
  total_results: number;
}

export interface TMDBErrorResponse {
  status_code: number;
  status_message: string;
  success: boolean;
}

async function fetchWithAuth(url: string) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error("TMDB_API_KEY is not configured");
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      accept: "application/json",
    },
  });

  if (!response.ok) {
    try {
      const errorData = (await response.json()) as TMDBErrorResponse;
      if (errorData.status_code && errorData.status_message) {
        console.error(
          `TMDB API Error: ${response.status} (Code: ${errorData.status_code}) - ${errorData.status_message}`,
        );
      } else {
        console.error(`TMDB API Error: ${response.status} ${response.statusText}`);
      }
    } catch {
      // Fallback if response is not JSON
      console.error(`TMDB API Error: ${response.status} ${response.statusText}`);
    }
    throw new Error(`Failed to fetch data from TMDB: ${response.status}`);
  }

  return response.json();
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

    const response = (await fetchWithAuth(url.toString())) as TMDBSearchResponse;

    response.results = response.results.map((item) => ({
      ...item,
      media_type: item.media_type || type,
    }));

    return response;
  });

export const getTVDetails = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ id: z.number() }).parse(data))
  .handler(async ({ data }): Promise<TMDBTVDetails> => {
    const url = new URL(`${TMDB_BASE_URL}/tv/${data.id}`);
    return (await fetchWithAuth(url.toString())) as TMDBTVDetails;
  });

export const getSeasonDetails = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ id: z.number(), seasonNumber: z.number() }).parse(data))
  .handler(async ({ data }): Promise<TMDBSeasonDetails> => {
    const url = new URL(`${TMDB_BASE_URL}/tv/${data.id}/season/${data.seasonNumber}`);
    return (await fetchWithAuth(url.toString())) as TMDBSeasonDetails;
  });

export const getMovieDetails = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ id: z.number() }).parse(data))
  .handler(async ({ data }): Promise<TMDBMovieDetails> => {
    const url = new URL(`${TMDB_BASE_URL}/movie/${data.id}`);
    return (await fetchWithAuth(url.toString())) as TMDBMovieDetails;
  });
