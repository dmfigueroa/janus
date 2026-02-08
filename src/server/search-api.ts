import { z } from "zod";
import { searchMultimedia } from "./tmdb";
import { searchBooks } from "./google-books";
import { searchGames } from "./rawg";
import { searchComics } from "./comicvine";
import { type UnifiedMedia } from "./media";
import { API_PAGE_SIZE } from "./constants";
import { db } from "../db";
import { watchlistItems } from "../db/schema";
import { and, eq, sql } from "drizzle-orm";
import { escapeLikeString } from "../utils/search";

export const searchInputSchema = z.object({
  query: z.string().min(1),
  page: z.coerce.number().default(1),
  type: z.enum(["movie", "tv", "game", "book", "comic"]).default("movie"),
});

async function searchCustomMedia(query: string, type: string): Promise<UnifiedMedia[]> {
    const escapedQuery = escapeLikeString(query);
    const items = await db
        .select({
            id: watchlistItems.tmdbId,
            title: watchlistItems.title,
            mediaType: watchlistItems.mediaType,
            posterPath: watchlistItems.posterPath,
            releaseDate: watchlistItems.releaseDate,
            voteAverage: watchlistItems.voteAverage,
            source: watchlistItems.source,
        })
        .from(watchlistItems)
        .where(
            and(
                eq(watchlistItems.source, "custom"),
                eq(watchlistItems.mediaType, type as any),
                sql`lower(${watchlistItems.title}) LIKE ${`%${escapedQuery.toLowerCase()}%`}`
            )
        )
        .groupBy(watchlistItems.tmdbId);

    return items.map(item => ({
        id: item.id,
        mediaType: item.mediaType as any,
        title: item.title,
        poster: item.posterPath,
        year: item.releaseDate ? item.releaseDate.split('-')[0] : undefined,
        releaseDate: item.releaseDate || undefined,
        rating: item.voteAverage || undefined,
        source: "custom" as const,
    }));
}

export const searchUnifiedHandler = async ({ data }: { data: z.infer<typeof searchInputSchema> }) => {
    const { query, type, page } = data;

    let results: UnifiedMedia[] = [];
    let totalResults = 0;
    const limit = API_PAGE_SIZE;

    // 1. Fetch external results
    if (type === "movie" || type === "tv") {
      const resp = await searchMultimedia({ data: { query, page, type } });
      results = resp.results;
      totalResults = resp.total_results;
    } else if (type === "book") {
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

    // 2. Fetch and merge custom results (only on page 1)
    if (page === 1) {
        const customResults = await searchCustomMedia(query, type);
        results = [...customResults, ...results];
        totalResults += customResults.length;
    }

    const totalPages = Math.ceil(totalResults / limit);

    return {
      results,
      page,
      total_pages: totalPages || 1,
      total_results: totalResults,
    };
  };
