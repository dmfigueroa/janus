import { searchAnilist } from "@/server/providers/Anilist.server";
import { searchComics } from "@/server/providers/Comicvine.server";
import { searchBooks } from "@/server/providers/GoogleBooks.server";
import { searchGames } from "@/server/providers/Rawg.server";
import { searchMultimedia } from "@/server/providers/Tmdb.server";
import { API_PAGE_SIZE } from "@/server/Constants";
import { DEPRECATED_MEDIA_MESSAGE, isDeprecatedMediaType, type UnifiedMedia } from "@/server/Media";
import type { SearchableMediaType } from "./MediaSearch";

type ProviderSearchResult = { results: UnifiedMedia[]; totalResults: number };

export const PROVIDER_UNAVAILABLE_MESSAGE =
  "Search is temporarily unavailable for this media type. Please try again later.";

export type MediaSearchPage = {
  results: UnifiedMedia[];
  page: number;
  total_pages: number;
  total_results: number;
  rejected: boolean;
  message?: string;
};

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

const providerSearches: Record<
  Exclude<SearchableMediaType, "movie" | "tv">,
  (query: string, page: number) => Promise<ProviderSearchResult>
> = {
  book: searchBooks,
  game: searchGameProvider,
  comic: searchComicProvider,
  anime: (query, page) => searchAnilist(query, "ANIME", page),
  manga: (query, page) => searchAnilist(query, "MANGA", page),
};

function formatProviderResponse(result: ProviderSearchResult, page: number): MediaSearchPage {
  const totalPages = Math.ceil(result.totalResults / API_PAGE_SIZE);
  return {
    results: result.results,
    page,
    total_pages: totalPages || 1,
    total_results: result.totalResults,
    rejected: false,
  };
}

function isTmdbMediaType(mediaType: SearchableMediaType) {
  return mediaType === "movie" || mediaType === "tv";
}

async function searchTmdbMedia(query: string, mediaType: "movie" | "tv", page: number) {
  const result = await searchMultimedia({ query, page, type: mediaType });
  return { ...result, rejected: false };
}

async function getMediaSearchPage(query: string, mediaType: SearchableMediaType, page: number) {
  if (isTmdbMediaType(mediaType)) return searchTmdbMedia(query, mediaType, page);

  return formatProviderResponse(await providerSearches[mediaType](query, page), page);
}

export function getDeprecatedMediaSearchPage(
  mediaType: string,
  page: number,
): MediaSearchPage | null {
  if (!isDeprecatedMediaType(mediaType)) return null;

  return {
    results: [],
    page,
    total_pages: 1,
    total_results: 0,
    rejected: true,
    message: DEPRECATED_MEDIA_MESSAGE,
  };
}

function getUnavailableMediaSearchPage(page: number): MediaSearchPage {
  return {
    results: [],
    page,
    total_pages: 1,
    total_results: 0,
    rejected: true,
    message: PROVIDER_UNAVAILABLE_MESSAGE,
  };
}

export async function searchMedia({
  query,
  mediaType,
  page,
}: {
  query: string;
  mediaType: SearchableMediaType;
  page: number;
}): Promise<MediaSearchPage> {
  const deprecatedPage = getDeprecatedMediaSearchPage(mediaType, page);
  if (deprecatedPage) return deprecatedPage;

  try {
    return await getMediaSearchPage(query, mediaType, page);
  } catch {
    return getUnavailableMediaSearchPage(page);
  }
}
