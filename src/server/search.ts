"use server";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { searchMultimedia } from "./tmdb";
import { searchBooks } from "./google-books";
import { searchGames } from "./rawg";
import { searchComics } from "./comicvine";
import { searchAnilist } from "./anilist";
import { type UnifiedMedia } from "./media";
import { API_PAGE_SIZE } from "./constants";

const searchInputSchema = z.object({
  query: z.string().min(1),
  page: z.coerce.number().default(1),
  type: z.enum(["movie", "tv", "game", "book", "comic", "anime", "manga"]).default("movie"),
});

export const searchUnified = createServerFn({ method: "GET" })
  .inputValidator((data) => searchInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { query, type, page } = data;

    if (type === "movie" || type === "tv") {
      return searchMultimedia({ data: { query, page, type } });
    }

    let results: UnifiedMedia[] = [];
    let totalResults = 0;
    const limit = API_PAGE_SIZE;

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
    } else if (type === "anime") {
      const resp = await searchAnilist(query, "ANIME", page);
      results = resp.results;
      totalResults = resp.totalResults;
    } else if (type === "manga") {
      const resp = await searchAnilist(query, "MANGA", page);
      results = resp.results;
      totalResults = resp.totalResults;
    }

    const totalPages = Math.ceil(totalResults / limit);

    return {
      results,
      page,
      total_pages: totalPages || 1,
      total_results: totalResults,
    };
  });
