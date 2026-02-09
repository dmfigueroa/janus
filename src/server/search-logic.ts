import { z } from "zod";
import { searchMultimedia } from "./tmdb";
import { searchBooks } from "./google-books";
import { searchGames } from "./rawg";
import { searchComics } from "./comicvine";
import { type UnifiedMedia } from "./media";
import { API_PAGE_SIZE } from "./constants";
import { db } from "../db";
import { watchlistItems } from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import { escapeLikeString } from "../utils/search";

export const searchInputSchema = z.object({
  query: z.string().min(1),
  page: z.coerce.number().default(1),
  type: z.enum(["movie", "tv", "game", "book", "comic"]).default("movie"),
});

export type SearchInput = z.infer<typeof searchInputSchema>;

export const searchCustomItems = async (
  query: string,
  type: "movie" | "tv" | "game" | "book" | "comic",
): Promise<UnifiedMedia[]> => {
  const items = await db
    .select({
      id: watchlistItems.tmdbId,
      mediaType: watchlistItems.mediaType,
      title: watchlistItems.title,
      posterPath: watchlistItems.posterPath,
      releaseDate: watchlistItems.releaseDate,
      voteAverage: watchlistItems.voteAverage,
    })
    .from(watchlistItems)
    .where(
      and(
        eq(watchlistItems.source, "custom"),
        eq(watchlistItems.mediaType, type),
        sql`${watchlistItems.title} LIKE ${`%${escapeLikeString(query)}%`} ESCAPE '\'`
      ),
    )
    .groupBy(watchlistItems.tmdbId);

  return items.map((item) => ({
    id: item.id,
    mediaType: item.mediaType as UnifiedMedia["mediaType"],
    source: "custom",
    title: item.title,
    poster: item.posterPath,
    year: item.releaseDate ? item.releaseDate.split("-")[0] : undefined,
    releaseDate: item.releaseDate || undefined,
    rating: item.voteAverage || undefined,
    overview: "",
    backdrop: null,
  }));
};

export const searchUnifiedHandler = async ({ data }: { data: SearchInput }) => {
  const { query, type, page } = data;

  let results: UnifiedMedia[] = [];
  let totalResults = 0;
  let totalPages = 1;
  const limit = API_PAGE_SIZE;

  if (type === "movie" || type === "tv") {
    const resp = await searchMultimedia({ data: { query, page, type } });
    results = resp.results;
    totalResults = resp.total_results;
    totalPages = resp.total_pages;
  } else {
    if (type === "book") {
      const resp = await searchBooks(query, page);
      results = resp.results;
      totalResults = resp.totalResults;
    } else if (type === "game") {
      const apiKey = process.env.RAWG_API_KEY;
      if (!apiKey) throw new Error("RAWG_API_KEY is not configured");
      const resp = await searchGames(query, apiKey, page);
      results = resp.results;
      totalResults = resp.totalResults;
    } else if (type === "comic") {
      const apiKey = process.env.COMICVINE_API_KEY;
      if (!apiKey) throw new Error("COMICVINE_API_KEY is not configured");
      const resp = await searchComics(query, apiKey, page);
      results = resp.results;
      totalResults = resp.totalResults;
    }
    totalPages = Math.ceil(totalResults / limit) || 1;
  }

  if (page === 1) {
    const customItems = await searchCustomItems(query, type);
    results = [...customItems, ...results];
    totalResults += customItems.length;
  }

  return {
    results,
    page,
    total_pages: totalPages,
    total_results: totalResults,
  };
};
