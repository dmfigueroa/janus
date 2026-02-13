"use server";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { searchMultimedia } from "./tmdb";
import { searchBooksInternal } from "./google-books";
import { searchGamesInternal } from "./rawg";
import { searchComicsInternal } from "./comicvine";
import { type UnifiedMedia } from "./media";
import { API_PAGE_SIZE } from "./constants";

const searchInputSchema = z.object({
  query: z.string().min(1),
  page: z.coerce.number().default(1),
  type: z.enum(["movie", "tv", "game", "book", "comic"]).default("movie"),
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
      const resp = await searchBooksInternal({ query, page });
      results = resp.results;
      totalResults = resp.totalResults;
    } else if (type === "game") {
      const resp = await searchGamesInternal({ query, page });
      results = resp.results;
      totalResults = resp.totalResults;
    } else if (type === "comic") {
      const resp = await searchComicsInternal({ query, page });
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
