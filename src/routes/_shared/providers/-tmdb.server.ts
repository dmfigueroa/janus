"use server";

import { Effect } from "effect";
import { type UnifiedMedia } from "../-media";
import { fetchFromTMDB, type TMDBMedia } from "./-tmdb-api.server";

export type { TMDBMedia, TMDBSearchResponse } from "./-tmdb-api.server";
export { getTVDetails, getSeasonDetails, getMovieDetails } from "./-tmdb-api.server";

function toUnifiedMedia(item: TMDBMedia, type: "movie" | "tv"): UnifiedMedia {
  return {
    id: item.id.toString(),
    mediaType: item.media_type || type,
    source: "tmdb",
    title: item.title || item.name || "Untitled",
    poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
    backdrop: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
    year: (item.release_date || item.first_air_date)?.split("-")[0],
    releaseDate: item.release_date || item.first_air_date,
    rating: item.vote_average,
    overview: item.overview,
  };
}

export function searchMultimedia(
  query: string,
  page: number,
  type: "movie" | "tv",
): Effect.Effect<
  { results: UnifiedMedia[]; page: number; total_pages: number; total_results: number },
  Error
> {
  return Effect.gen(function* () {
    const tmdbData = yield* fetchFromTMDB(query, page, type);

    const results = tmdbData.results.map((item) => toUnifiedMedia(item, type));

    return {
      results,
      page: tmdbData.page,
      total_pages: tmdbData.total_pages,
      total_results: tmdbData.total_results,
    };
  });
}
