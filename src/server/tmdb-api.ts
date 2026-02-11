import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

// Simple LRU Cache Implementation
const TMDB_CACHE_SIZE = 100;
const TMDB_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  data: TMDBSearchResponse;
  timestamp: number;
}

const tmdbCache = new Map<string, CacheEntry>();

function getCacheKey(query: string, page: number, type: string): string {
  return `${type}:${query}:${page}`;
}

function getFromCache(key: string): TMDBSearchResponse | null {
  const entry = tmdbCache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > TMDB_CACHE_TTL) {
    tmdbCache.delete(key);
    return null;
  }

  // Refresh LRU (mark as recently used)
  tmdbCache.delete(key);
  tmdbCache.set(key, entry);
  return entry.data;
}

function addToCache(key: string, data: TMDBSearchResponse) {
  if (tmdbCache.has(key)) {
    tmdbCache.delete(key);
  } else if (tmdbCache.size >= TMDB_CACHE_SIZE) {
    // Evict oldest entry
    const oldestKey = tmdbCache.keys().next().value;
    if (oldestKey) tmdbCache.delete(oldestKey);
  }

  tmdbCache.set(key, {
    data,
    timestamp: Date.now(),
  });
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
          `TMDB API Error: ${response.status} (Code: ${errorData.status_code}) - ${errorData.status_message}`
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

export async function fetchFromTMDBHandler(data: { query: string; page: number; type: "movie" | "tv" }) {
  const { query, page, type } = data;

  const cacheKey = getCacheKey(query, page, type);
  const cachedData = getFromCache(cacheKey);

  if (cachedData) {
    return cachedData;
  }

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

  addToCache(cacheKey, response);

  return response;
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
    return fetchFromTMDBHandler(data);
  });

export const getTVDetails = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ id: z.number() }).parse(data))
  .handler(async ({ data }) => {
    const url = new URL(`${TMDB_BASE_URL}/tv/${data.id}`);
    return fetchWithAuth(url.toString());
  });

export const getSeasonDetails = createServerFn({ method: "GET" })
  .inputValidator((data) =>
    z.object({ id: z.number(), seasonNumber: z.number() }).parse(data),
  )
  .handler(async ({ data }) => {
    const url = new URL(
      `${TMDB_BASE_URL}/tv/${data.id}/season/${data.seasonNumber}`,
    );
    return fetchWithAuth(url.toString());
  });

export const getMovieDetails = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ id: z.number() }).parse(data))
  .handler(async ({ data }) => {
    const url = new URL(`${TMDB_BASE_URL}/movie/${data.id}`);
    return fetchWithAuth(url.toString());
  });
