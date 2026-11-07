import {
  ProviderRequestError,
  requestProviderJson,
  parseProviderData,
} from "@/integrations/ProviderRequest.server";
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

export interface TMDBErrorResponse {
  status_code: number;
  status_message: string;
  success: boolean;
}

const tmdbMovieSchema = z.object({
  title: z.string().optional(),
  name: z.string().optional(),
  poster_path: z.string().nullable(),
  release_date: z.string().optional(),
  vote_average: z.number().optional(),
  runtime: z.number().nullable().optional(),
});

const tmdbTvSchema = z.object({
  name: z.string().optional(),
  poster_path: z.string().nullable(),
  seasons: z.array(z.object({ season_number: z.number() })),
});

const tmdbEpisodeSchema = z.object({
  id: z.number(),
  name: z.string(),
  season_number: z.number(),
  episode_number: z.number(),
  still_path: z.string().nullable(),
  air_date: z.string().nullable().optional(),
  vote_average: z.number(),
  runtime: z.number().nullable().optional(),
});

const tmdbSeasonSchema = z.object({ episodes: z.array(tmdbEpisodeSchema) });
export type TMDBEpisode = z.infer<typeof tmdbEpisodeSchema>;

function getTmdbApiKey() {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) throw new ProviderRequestError("provider_not_configured");
  return apiKey;
}

async function fetchWithAuth(url: string) {
  const apiKey = getTmdbApiKey();
  return requestProviderJson(url, {
    headers: { Authorization: `Bearer ${apiKey}`, accept: "application/json" },
  });
}

export async function fetchTmdbSearch(data: { query: string; page: number; type: "movie" | "tv" }) {
  const { query, page, type } = z
    .object({
      query: z.string(),
      page: z.number(),
      type: z.enum(["movie", "tv"]),
    })
    .parse(data);
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
}

export async function fetchTmdbTv(data: { id: number }) {
  const input = z.object({ id: z.number() }).parse(data);
  const url = new URL(`${TMDB_BASE_URL}/tv/${input.id}`);
  return parseProviderData(tmdbTvSchema, await fetchWithAuth(url.toString()));
}

export async function fetchTmdbSeason(data: { id: number; seasonNumber: number }) {
  const input = z.object({ id: z.number(), seasonNumber: z.number() }).parse(data);
  const url = new URL(`${TMDB_BASE_URL}/tv/${input.id}/season/${input.seasonNumber}`);
  return parseProviderData(tmdbSeasonSchema, await fetchWithAuth(url.toString()));
}

export async function fetchTmdbMovie(data: { id: number }) {
  const input = z.object({ id: z.number() }).parse(data);
  const url = new URL(`${TMDB_BASE_URL}/movie/${input.id}`);
  return parseProviderData(tmdbMovieSchema, await fetchWithAuth(url.toString()));
}
