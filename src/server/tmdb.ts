"use server";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { type UnifiedMedia } from "./media";

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
  .handler(
    async ({
      data,
    }): Promise<{
      results: UnifiedMedia[];
      page: number;
      total_pages: number;
      total_results: number;
    }> => {
      const { query, page, type } = data;
      const apiKey = process.env.TMDB_API_KEY;

      if (!apiKey) {
        throw new Error("TMDB_API_KEY is not configured");
      }

      const tmdbData = await fetchFromTMDB(query, page, type, apiKey);

      const results: UnifiedMedia[] = tmdbData.results.map((item) => ({
        id: item.id.toString(),
        mediaType: item.media_type || type,
        source: "tmdb",
        title: item.title || item.name || "Untitled",
        poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
        backdrop: item.backdrop_path
          ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}`
          : null,
        year: (item.release_date || item.first_air_date)?.split("-")[0],
        rating: item.vote_average,
        overview: item.overview,
      }));

      return {
        results,
        page: tmdbData.page,
        total_pages: tmdbData.total_pages,
        total_results: tmdbData.total_results,
      };
    },
  );

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
