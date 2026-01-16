"use server";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

export interface TMDBMedia {
  id: number;
  media_type: "movie" | "tv";
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
  apiKey: string,
  depth = 0,
): Promise<TMDBSearchResponse> {
  const url = new URL(`${TMDB_BASE_URL}/search/multi`);
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

  const json = (await response.json()) as TMDBSearchResponse;
  const filteredResults = json.results.filter(
    (item) => item.media_type === "movie" || item.media_type === "tv",
  );

  // If we filtered out all results, but there are more pages, keep looking
  // Limit recursion to avoid timeouts (e.g. 5 attempts)
  if (filteredResults.length === 0 && json.page < json.total_pages && depth < 5) {
    return fetchFromTMDB(query, page + 1, apiKey, depth + 1);
  }

  return { ...json, results: filteredResults };
}

export const searchMultimedia = createServerFn({ method: "GET" })
  .inputValidator((data) =>
    z
      .object({
        query: z.string().min(1),
        page: z.coerce.number().default(1),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { query, page } = data;
    const apiKey = process.env.TMDB_API_KEY;

    if (!apiKey) {
      throw new Error("TMDB_API_KEY is not configured");
    }

    return fetchFromTMDB(query, page, apiKey);
  });
