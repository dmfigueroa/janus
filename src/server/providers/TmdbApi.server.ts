import {
  ProviderRequestError,
  requestProviderJson,
  parseProviderData,
} from "@/integrations/ProviderRequest.server";
import { z } from "zod";
import { logMissingProviderConfiguration } from "@/integrations/ProviderLogging.server";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const tmdbResourceIdSchema = z.number().int().positive().refine(Number.isSafeInteger);
const tmdbSeasonNumberSchema = z.number().int().nonnegative().refine(Number.isSafeInteger);

const tmdbMediaSchema = z.object({
  id: z.number(),
  media_type: z.enum(["movie", "tv"]).optional(),
  title: z.string().optional(),
  name: z.string().optional(),
  poster_path: z.string().nullable(),
  backdrop_path: z.string().nullable(),
  release_date: z.string().optional(),
  first_air_date: z.string().optional(),
  vote_average: z.number(),
  overview: z.string(),
});

const tmdbSearchResponseSchema = z.object({
  page: z.number(),
  results: z.array(tmdbMediaSchema),
  total_pages: z.number(),
  total_results: z.number(),
});

export type TMDBMedia = z.infer<typeof tmdbMediaSchema>;
export type TMDBSearchResponse = z.infer<typeof tmdbSearchResponseSchema>;

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

function getTmdbApiKey(operation: string) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    logMissingProviderConfiguration("tmdb", operation);
    throw new ProviderRequestError("provider_not_configured");
  }
  return apiKey;
}

async function fetchWithAuth(url: string, operation: string, signal?: AbortSignal) {
  const apiKey = getTmdbApiKey(operation);
  return requestProviderJson(
    url,
    {
      headers: { Authorization: `Bearer ${apiKey}`, accept: "application/json" },
      signal,
    },
    { provider: "tmdb", operation },
  );
}

export async function fetchTmdbSearch(
  data: { query: string; page: number; type: "movie" | "tv" },
  signal?: AbortSignal,
) {
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

  const operation = type === "movie" ? "search_movies" : "search_tv";
  const response = parseProviderData(
    tmdbSearchResponseSchema,
    await fetchWithAuth(url.toString(), operation, signal),
    { provider: "tmdb", operation },
  );
  return assignSearchMediaType(response, type);
}

function assignSearchMediaType(response: TMDBSearchResponse, type: "movie" | "tv") {
  return {
    ...response,
    results: response.results.map((item) => assignMediaType(item, type)),
  };
}

function assignMediaType(item: TMDBMedia, type: "movie" | "tv"): TMDBMedia {
  return {
    ...item,
    media_type: item.media_type || type,
  };
}

export async function fetchTmdbTv(data: { id: number }, signal?: AbortSignal) {
  const input = z.object({ id: tmdbResourceIdSchema }).parse(data);
  const url = new URL(`${TMDB_BASE_URL}/tv/${input.id}`);
  const context = { provider: "tmdb", operation: "get_tv_details" };
  return parseProviderData(
    tmdbTvSchema,
    await fetchWithAuth(url.toString(), context.operation, signal),
    context,
  );
}

export async function fetchTmdbSeason(
  data: { id: number; seasonNumber: number },
  signal?: AbortSignal,
) {
  const input = z
    .object({ id: tmdbResourceIdSchema, seasonNumber: tmdbSeasonNumberSchema })
    .parse(data);
  const url = new URL(`${TMDB_BASE_URL}/tv/${input.id}/season/${input.seasonNumber}`);
  const context = { provider: "tmdb", operation: "get_season_details" };
  return parseProviderData(
    tmdbSeasonSchema,
    await fetchWithAuth(url.toString(), context.operation, signal),
    context,
  );
}

export async function fetchTmdbMovie(data: { id: number }, signal?: AbortSignal) {
  const input = z.object({ id: tmdbResourceIdSchema }).parse(data);
  const url = new URL(`${TMDB_BASE_URL}/movie/${input.id}`);
  const context = { provider: "tmdb", operation: "get_movie_details" };
  return parseProviderData(
    tmdbMovieSchema,
    await fetchWithAuth(url.toString(), context.operation, signal),
    context,
  );
}
