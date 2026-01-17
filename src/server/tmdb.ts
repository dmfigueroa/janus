"use server";

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

export interface TMDBSearchResponse {
  page: number;
  results: TMDBMedia[];
  total_pages: number;
  total_results: number;
}

async function fetchFromTMDB(
  query: string,
  page: number,
  type: "movie" | "tv",
  apiKey: string,
): Promise<TMDBSearchResponse> {
  const endpoint = type === "movie" ? "search/movie" : "search/tv";
  const url = new URL(`${TMDB_BASE_URL}/${endpoint}`);
  const params = new URLSearchParams({
    api_key: apiKey,
    query: query,
    page: page.toString(),
    include_adult: "false",
    language: "en-US",
  });
  url.search = params.toString();

  const response = await fetch(url.toString());

  if (!response.ok) {
    console.error("TMDB API Error:", await response.text());
    throw new Error("Failed to fetch data from TMDB");
  }

  const data = (await response.json()) as TMDBSearchResponse;

  // TMDB specific search endpoints don't always return media_type, so we inject it.
  data.results = data.results.map((item) => ({
    ...item,
    media_type: item.media_type || type,
  }));

  return data;
}

export const searchMultimedia = createServerFn({ method: "GET" })
  .inputValidator((data) =>
    z
      .object({
        query: z.string().min(1),
        page: z.coerce.number().default(1),
        type: z.enum(["movie", "tv"]).default("movie"),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { query, page, type } = data;
    const apiKey = process.env.TMDB_API_KEY;

    if (!apiKey) {
      throw new Error("TMDB_API_KEY is not configured");
    }

    return fetchFromTMDB(query, page, type, apiKey);
  });

export async function getTVDetails(id: number, apiKey: string) {
  const url = new URL(`${TMDB_BASE_URL}/tv/${id}`);
  url.searchParams.set("api_key", apiKey);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error("Failed to fetch TV details");
  }
  return response.json();
}

export async function getSeasonDetails(id: number, seasonNumber: number, apiKey: string) {
  const url = new URL(`${TMDB_BASE_URL}/tv/${id}/season/${seasonNumber}`);
  url.searchParams.set("api_key", apiKey);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error("Failed to fetch season details");
  }
  return response.json();
}

export async function getMovieDetails(id: number, apiKey: string) {
  const url = new URL(`${TMDB_BASE_URL}/movie/${id}`);
  url.searchParams.set("api_key", apiKey);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error("Failed to fetch movie details");
  }
  return response.json();
}
