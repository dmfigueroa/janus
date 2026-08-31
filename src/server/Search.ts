import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { searchMultimedia } from "./providers/Tmdb.server";
import { searchBooks } from "./providers/GoogleBooks.server";
import { searchGames } from "./providers/Rawg.server";
import { searchComics } from "./providers/Comicvine.server";
import { searchAnilist } from "./providers/Anilist.server";
import { type UnifiedMedia, isDeprecatedMediaType, DEPRECATED_MEDIA_MESSAGE } from "./Media";
import { API_PAGE_SIZE } from "./Constants";

const searchInputSchema = z.object({
  query: z.string().min(1),
  page: z.coerce.number().default(1),
  type: z.enum(["movie", "tv", "game", "book", "comic", "anime", "manga"]).default("movie"),
});

type SearchInput = z.infer<typeof searchInputSchema>;
type NonTmdbMediaType = Exclude<SearchInput["type"], "movie" | "tv">;
type ProviderSearchResult = { results: UnifiedMedia[]; totalResults: number };

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
  NonTmdbMediaType,
  (query: string, page: number) => Promise<ProviderSearchResult>
> = {
  book: searchBooks,
  game: searchGameProvider,
  comic: searchComicProvider,
  anime: (query, page) => searchAnilist(query, "ANIME", page),
  manga: (query, page) => searchAnilist(query, "MANGA", page),
};

function formatProviderResponse(result: ProviderSearchResult, page: number) {
  const totalPages = Math.ceil(result.totalResults / API_PAGE_SIZE);
  return {
    results: result.results,
    page,
    total_pages: totalPages || 1,
    total_results: result.totalResults,
    rejected: false,
  };
}

async function searchActiveMedia({ query, type, page }: SearchInput) {
  if (type === "movie" || type === "tv") {
    const result = await searchMultimedia({ query, page, type });
    return { ...result, rejected: false };
  }

  const result = await providerSearches[type](query, page);
  return formatProviderResponse(result, page);
}

export const getDeprecatedSearchResponse = (type: string, page: number) => {
  if (!isDeprecatedMediaType(type)) {
    return null;
  }

  return {
    results: [],
    page,
    total_pages: 1,
    total_results: 0,
    rejected: true,
    message: DEPRECATED_MEDIA_MESSAGE,
  };
};

export const searchUnified = createServerFn({ method: "GET" })
  .inputValidator((data) => searchInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { type, page } = data;

    const deprecatedResponse = getDeprecatedSearchResponse(type, page);
    if (deprecatedResponse) {
      return deprecatedResponse;
    }
    return searchActiveMedia(data);
  });
