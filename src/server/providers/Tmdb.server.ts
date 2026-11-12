import { type UnifiedMedia } from "../Media";
import { fetchTmdbSearch, type TMDBMedia } from "./TmdbApi.server";

export {
  type TMDBMedia,
  type TMDBSearchResponse,
  fetchTmdbMovie,
  fetchTmdbSeason,
  fetchTmdbTv,
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

export async function searchMultimedia(
  data: {
    query: string;
    page: number;
    type: "movie" | "tv";
  },
  signal?: AbortSignal,
): Promise<{
  results: UnifiedMedia[];
  page: number;
  total_pages: number;
  total_results: number;
}> {
  const tmdbData = await fetchTmdbSearch(data, signal);
  const results = tmdbData.results.map((item) => mapTmdbMedia(item, data.type));

  return {
    results,
    page: tmdbData.page,
    total_pages: tmdbData.total_pages,
    total_results: tmdbData.total_results,
  };
}
