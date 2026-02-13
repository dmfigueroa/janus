"use server";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { type UnifiedMedia, UnifiedMediaSchema } from "./media";
import { fetchFromTMDB } from "./tmdb-api";
import { CacheService } from "@/utils/cache";

export {
  type TMDBMedia,
  type TMDBSearchResponse,
  getTVDetails,
  getSeasonDetails,
  getMovieDetails,
} from "./tmdb-api";

const SearchMultimediaResponseSchema = z.object({
  results: z.array(UnifiedMediaSchema),
  page: z.number(),
  total_pages: z.number(),
  total_results: z.number(),
});

export const searchMultimedia = createServerFn({ method: "GET" })
  .inputValidator((data) =>
    z
      .object({
        query: z.string().min(1),
        page: z.coerce.number().default(1),
        type: z.enum(["movie", "tv"]).default("movie"),
        forceRefresh: z.boolean().optional(),
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
      const { query, page, type, forceRefresh } = data;
      const cacheKey = `tmdb-search-${type}-${query}-${page}`;

      return CacheService.withCache(
        cacheKey,
        "tmdb",
        async () => {
          const tmdbData = await fetchFromTMDB({ data: { query, page, type } });

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
            releaseDate: item.release_date || item.first_air_date,
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
        SearchMultimediaResponseSchema,
        { forceRefresh },
      );
    },
  );
