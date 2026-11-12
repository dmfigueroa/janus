import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { UnifiedMedia } from "@/server/Media";

export const searchableMediaTypes = [
  "movie",
  "tv",
  "game",
  "book",
  "comic",
  "anime",
  "manga",
] as const;

export type SearchableMediaType = (typeof searchableMediaTypes)[number];

export const searchableMediaLabels: Record<SearchableMediaType, string> = {
  movie: "Movies",
  tv: "TV",
  game: "Games",
  book: "Books",
  comic: "Comics",
  anime: "Anime",
  manga: "Manga",
};

export const searchableMediaTabs = searchableMediaTypes
  .filter((type) => type !== "anime" && type !== "manga")
  .map((type) => ({ label: searchableMediaLabels[type], value: type }));

export const EMPTY_MEDIA_SEARCH_MESSAGE = "Enter a search term to find media.";

export const PROVIDER_UNAVAILABLE_MESSAGE =
  "Search is temporarily unavailable for this media type. Please try again later.";

export type MediaSearchStatus =
  | "ok"
  | "empty_query"
  | "deprecated_media_type"
  | "provider_unavailable";

export type MediaSearchSuccess = {
  status: "ok";
  results: UnifiedMedia[];
  page: number;
  totalPages: number;
  totalResults: number;
  /** Keeps `outcome.message` readable without narrowing on the successful branch. */
  message?: undefined;
};

export type MediaSearchRejection = {
  status: Exclude<MediaSearchStatus, "ok">;
  page: number;
  message: string;
};

export type MediaSearchOutcome = MediaSearchSuccess | MediaSearchRejection;

export type MediaSearchInput = {
  query: string;
  mediaType: SearchableMediaType;
  page: number;
};

export function normalizeMediaSearchQuery(query: string) {
  return query.trim();
}

export function normalizeMediaSearchPage(page: number) {
  return Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1;
}

const mediaSearchInputSchema = z.object({
  query: z.string().default(""),
  page: z.coerce.number().default(1),
  type: z.enum(searchableMediaTypes).default("movie"),
});

export const searchUnified = createServerFn({ method: "GET" })
  .validator((data) => mediaSearchInputSchema.parse(data))
  .handler(({ data }) =>
    import("./MediaSearch.server").then(({ searchMedia }) =>
      searchMedia({ query: data.query, mediaType: data.type, page: data.page }),
    ),
  );
