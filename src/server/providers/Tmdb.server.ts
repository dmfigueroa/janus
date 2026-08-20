"use server";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { type UnifiedMedia } from "../Media";
import { fetchFromTMDB, type TMDBMedia } from "./TmdbApi.server";

export {
  type TMDBMedia,
  type TMDBSearchResponse,
  getTVDetails,
  getSeasonDetails,
  getMovieDetails,
} from "./TmdbApi.server";

function getTmdbImage(path: string | null, size: "w500" | "w1280") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

function getTmdbMediaType(item: TMDBMedia, type: "movie" | "tv") {
  return item.media_type || type;
}

function getTmdbTitle(item: TMDBMedia) {
  return item.title || item.name || "Untitled";
}

function getTmdbReleaseDate(item: TMDBMedia) {
  return item.release_date || item.first_air_date;
}

function mapTmdbMedia(item: TMDBMedia, type: "movie" | "tv"): UnifiedMedia {
  const releaseDate = getTmdbReleaseDate(item);
  return {
    id: item.id.toString(),
    mediaType: getTmdbMediaType(item, type),
    source: "tmdb",
    title: getTmdbTitle(item),
    poster: getTmdbImage(item.poster_path, "w500"),
    backdrop: getTmdbImage(item.backdrop_path, "w1280"),
    year: releaseDate?.split("-")[0],
    releaseDate,
    rating: item.vote_average,
    overview: item.overview,
  };
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

      const tmdbData = await fetchFromTMDB({ data: { query, page, type } });

      const results: UnifiedMedia[] = tmdbData.results.map((item) => mapTmdbMedia(item, type));

      return {
        results,
        page: tmdbData.page,
        total_pages: tmdbData.total_pages,
        total_results: tmdbData.total_results,
      };
    },
  );
