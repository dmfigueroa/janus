import { searchComics } from "@/server/providers/Comicvine.server";
import { searchBooks } from "@/server/providers/GoogleBooks.server";
import { searchGames } from "@/server/providers/Rawg.server";
import { searchMultimedia } from "@/server/providers/Tmdb.server";
import { API_PAGE_SIZE } from "@/server/Constants";
import { DEPRECATED_MEDIA_MESSAGE, isDeprecatedMediaType, type UnifiedMedia } from "@/server/Media";
import {
  EMPTY_MEDIA_SEARCH_MESSAGE,
  PROVIDER_UNAVAILABLE_MESSAGE,
  normalizeMediaSearchPage,
  normalizeMediaSearchQuery,
  type MediaSearchInput,
  type MediaSearchOutcome,
  type MediaSearchRejection,
  type MediaSearchSuccess,
  type SearchableMediaType,
} from "./MediaSearch";

type ProviderSearchResult = { results: UnifiedMedia[]; totalResults: number };
type ProviderSearch = (query: string, page: number) => Promise<ProviderSearchResult>;
type ActiveProviderMediaType = Exclude<SearchableMediaType, "movie" | "tv" | "anime" | "manga">;

async function searchGameProvider(query: string, page: number) {
  const apiKey = process.env.RAWG_API_KEY;
  if (!apiKey) throw new Error("RAWG_API_KEY is not configured");
  return searchGames(query, apiKey, page);
}

async function searchComicProvider(query: string, page: number) {
  const apiKey = process.env.COMICVINE_API_KEY;
  if (!apiKey) throw new Error("COMICVINE_API_KEY is not configured");
  return searchComics(query, apiKey, page);
}

const providerSearches: Record<ActiveProviderMediaType, ProviderSearch> = {
  book: searchBooks,
  game: searchGameProvider,
  comic: searchComicProvider,
};

function isActiveProviderMediaType(
  mediaType: SearchableMediaType,
): mediaType is ActiveProviderMediaType {
  return mediaType in providerSearches;
}

function formatProviderResponse(result: ProviderSearchResult, page: number): MediaSearchSuccess {
  const totalPages = Math.ceil(result.totalResults / API_PAGE_SIZE);
  return {
    status: "ok",
    results: result.results,
    page,
    totalPages: totalPages || 1,
    totalResults: result.totalResults,
  };
}

function isTmdbMediaType(mediaType: SearchableMediaType): mediaType is "movie" | "tv" {
  return mediaType === "movie" || mediaType === "tv";
}

async function searchTmdbMedia(
  query: string,
  mediaType: "movie" | "tv",
  page: number,
): Promise<MediaSearchSuccess> {
  const result = await searchMultimedia({ query, page, type: mediaType });
  return {
    status: "ok",
    results: result.results,
    page,
    totalPages: result.total_pages || 1,
    totalResults: result.total_results,
  };
}

async function getMediaSearchPage(
  query: string,
  mediaType: SearchableMediaType,
  page: number,
): Promise<MediaSearchOutcome> {
  if (isTmdbMediaType(mediaType)) return searchTmdbMedia(query, mediaType, page);

  if (!isActiveProviderMediaType(mediaType)) {
    throw new Error(`Unsupported media type: ${mediaType}`);
  }

  return formatProviderResponse(await providerSearches[mediaType](query, page), page);
}

function getLocalRejection(
  query: string,
  mediaType: SearchableMediaType,
  page: number,
): MediaSearchRejection | null {
  if (!query) {
    return {
      status: "empty_query",
      page,
      message: EMPTY_MEDIA_SEARCH_MESSAGE,
    };
  }

  if (isDeprecatedMediaType(mediaType)) {
    return {
      status: "deprecated_media_type",
      page,
      message: DEPRECATED_MEDIA_MESSAGE,
    };
  }

  return null;
}

async function searchProviders(
  query: string,
  mediaType: SearchableMediaType,
  page: number,
): Promise<MediaSearchOutcome> {
  try {
    return await getMediaSearchPage(query, mediaType, page);
  } catch {
    return {
      status: "provider_unavailable",
      page,
      message: PROVIDER_UNAVAILABLE_MESSAGE,
    };
  }
}

export async function searchMedia({
  query,
  mediaType,
  page,
}: MediaSearchInput): Promise<MediaSearchOutcome> {
  const normalizedPage = normalizeMediaSearchPage(page);
  const normalizedQuery = normalizeMediaSearchQuery(query);

  return (
    getLocalRejection(normalizedQuery, mediaType, normalizedPage) ??
    (await searchProviders(normalizedQuery, mediaType, normalizedPage))
  );
}
