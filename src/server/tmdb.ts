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

  return (await response.json()) as TMDBSearchResponse;
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
