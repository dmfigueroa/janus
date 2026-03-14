"use server";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { type UnifiedMedia } from "../media";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p";

const mediaTypeSchema = z.enum(["movie", "tv"]);
const idInputSchema = z.object({ id: z.number() });
const seasonDetailsInputSchema = z.object({ id: z.number(), seasonNumber: z.number() });
const searchInputSchema = z.object({
  query: z.string().min(1),
  page: z.coerce.number().default(1),
  type: mediaTypeSchema.default("movie"),
});

const tmdbMediaSchema = z.object({
  id: z.number(),
  media_type: mediaTypeSchema.optional(),
  title: z.string().optional(),
  name: z.string().optional(),
  poster_path: z.string().nullable(),
  backdrop_path: z.string().nullable(),
  release_date: z.string().optional(),
  first_air_date: z.string().optional(),
  vote_average: z.number(),
  overview: z.string(),
});

const tmdbMovieDetailsSchema = tmdbMediaSchema.extend({
  runtime: z.number().nullable().optional(),
});

const tmdbSeasonSchema = z.object({
  season_number: z.number(),
  episode_count: z.number().nullable().optional(),
});

const tmdbTvDetailsSchema = z.object({
  poster_path: z.string().nullable(),
  seasons: z.array(tmdbSeasonSchema).optional(),
});

const tmdbEpisodeSchema = z.object({
  id: z.number(),
  name: z.string(),
  season_number: z.number(),
  episode_number: z.number(),
  still_path: z.string().nullable(),
  air_date: z.string().optional(),
  vote_average: z.number(),
  runtime: z.number().nullable().optional(),
});

const tmdbSeasonDetailsSchema = z.object({
  episodes: z.array(tmdbEpisodeSchema).optional(),
});

const tmdbSearchResponseSchema = z.object({
  page: z.number(),
  results: z.array(tmdbMediaSchema),
  total_pages: z.number(),
  total_results: z.number(),
});

const tmdbErrorResponseSchema = z.object({
  status_code: z.number(),
  status_message: z.string(),
  success: z.boolean(),
});

export type TMDBMedia = z.infer<typeof tmdbMediaSchema>;
export type TMDBMovieDetails = z.infer<typeof tmdbMovieDetailsSchema>;
export type TMDBSeason = z.infer<typeof tmdbSeasonSchema>;
export type TMDBTVDetails = z.infer<typeof tmdbTvDetailsSchema>;
export type TMDBEpisode = z.infer<typeof tmdbEpisodeSchema>;
export type TMDBSeasonDetails = z.infer<typeof tmdbSeasonDetailsSchema>;
export type TMDBSearchResponse = z.infer<typeof tmdbSearchResponseSchema>;
export type TMDBErrorResponse = z.infer<typeof tmdbErrorResponseSchema>;

function getTmdbApiKey() {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error("TMDB_API_KEY is not configured");
  }

  return apiKey;
}

function createTmdbUrl(path: string, searchParams?: Record<string, string>) {
  const url = new URL(`${TMDB_BASE_URL}/${path}`);

  for (const [key, value] of Object.entries(searchParams ?? {})) {
    url.searchParams.set(key, value);
  }

  return url;
}

async function fetchTmdbJson<T>(
  path: string,
  schema: z.ZodType<T>,
  searchParams?: Record<string, string>,
) {
  const response = await fetch(createTmdbUrl(path, searchParams), {
    headers: {
      Authorization: `Bearer ${getTmdbApiKey()}`,
      accept: "application/json",
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const parsedError = tmdbErrorResponseSchema.safeParse(payload);
    if (parsedError.success) {
      console.error(
        `TMDB API Error: ${response.status} (Code: ${parsedError.data.status_code}) - ${parsedError.data.status_message}`,
      );
    } else {
      console.error(`TMDB API Error: ${response.status} ${response.statusText}`);
    }

    throw new Error(`Failed to fetch data from TMDB: ${response.status}`);
  }

  return schema.parse(payload);
}

function normalizeTmdbMediaType(item: TMDBMedia, type: z.infer<typeof mediaTypeSchema>): TMDBMedia {
  return {
    ...item,
    media_type: item.media_type ?? type,
  };
}

function buildTmdbImageUrl(size: "w500" | "w1280", path: string | null) {
  return path ? `${TMDB_IMAGE_BASE_URL}/${size}${path}` : null;
}

function toUnifiedMedia(
  item: TMDBMedia,
  fallbackType: z.infer<typeof mediaTypeSchema>,
): UnifiedMedia {
  return {
    id: item.id.toString(),
    mediaType: item.media_type ?? fallbackType,
    source: "tmdb",
    title: item.title || item.name || "Untitled",
    poster: buildTmdbImageUrl("w500", item.poster_path),
    backdrop: buildTmdbImageUrl("w1280", item.backdrop_path),
    year: (item.release_date || item.first_air_date)?.split("-")[0],
    releaseDate: item.release_date || item.first_air_date,
    rating: item.vote_average,
    overview: item.overview,
  };
}

async function searchTMDB(query: string, page: number, type: z.infer<typeof mediaTypeSchema>) {
  const endpoint = type === "movie" ? "search/movie" : "search/tv";
  const response = await fetchTmdbJson(endpoint, tmdbSearchResponseSchema, {
    query,
    page: page.toString(),
    include_adult: "false",
    language: "en-US",
  });

  return {
    ...response,
    results: response.results.map((item) => normalizeTmdbMediaType(item, type)),
  };
}

export const searchMultimedia = createServerFn({ method: "GET" })
  .inputValidator((data) => searchInputSchema.parse(data))
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
      const tmdbData = await searchTMDB(query, page, type);

      return {
        results: tmdbData.results.map((item) => toUnifiedMedia(item, type)),
        page: tmdbData.page,
        total_pages: tmdbData.total_pages,
        total_results: tmdbData.total_results,
      };
    },
  );

export const getTVDetails = createServerFn({ method: "GET" })
  .inputValidator((data) => idInputSchema.parse(data))
  .handler(async ({ data }): Promise<TMDBTVDetails> => {
    return fetchTmdbJson(`tv/${data.id}`, tmdbTvDetailsSchema);
  });

export const getSeasonDetails = createServerFn({ method: "GET" })
  .inputValidator((data) => seasonDetailsInputSchema.parse(data))
  .handler(async ({ data }): Promise<TMDBSeasonDetails> => {
    return fetchTmdbJson(`tv/${data.id}/season/${data.seasonNumber}`, tmdbSeasonDetailsSchema);
  });

export const getMovieDetails = createServerFn({ method: "GET" })
  .inputValidator((data) => idInputSchema.parse(data))
  .handler(async ({ data }): Promise<TMDBMovieDetails> => {
    return fetchTmdbJson(`movie/${data.id}`, tmdbMovieDetailsSchema);
  });
