"use server";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { API_PAGE_SIZE } from "./constants";
import { type UnifiedMedia, UnifiedMediaSchema } from "./media";
import { CacheService } from "@/utils/cache";

const RawgGameSchema = z.object({
  id: z.number(),
  name: z.string(),
  background_image: z.string().nullable().optional(),
  released: z.string().nullable().optional(),
  rating: z.number().optional(),
});

const RawgResponseSchema = z.object({
  results: z.array(RawgGameSchema).optional(),
  count: z.number().optional(),
});

const getRawgApiKey = () => {
  const apiKey = process.env.RAWG_API_KEY;
  if (!apiKey) throw new Error("RAWG_API_KEY is not configured");
  return apiKey;
};

const SearchGamesResponseSchema = z.object({
  results: z.array(UnifiedMediaSchema),
  totalResults: z.number(),
});

export async function searchGamesInternal(data: {
  query: string;
  page: number;
  forceRefresh?: boolean;
}): Promise<{ results: UnifiedMedia[]; totalResults: number }> {
  const { query, page, forceRefresh } = data;
  const cacheKey = `rawg-search-${query}-${page}`;

  return CacheService.withCache(
    cacheKey,
    "rawg",
    async () => {
      try {
        const apiKey = getRawgApiKey();
        const pageSize = API_PAGE_SIZE;
        const url = new URL("https://api.rawg.io/api/games");
        url.search = new URLSearchParams({
          key: apiKey,
          search: query,
          page: page.toString(),
          page_size: pageSize.toString(),
        }).toString();

        const res = await fetch(url.toString());
        if (!res.ok) return { results: [], totalResults: 0 };

        const rawData = await res.json();
        const parsedData = RawgResponseSchema.parse(rawData);

        const results: UnifiedMedia[] = (parsedData.results || []).map((game) => ({
          id: game.id.toString(),
          mediaType: "game" as const,
          source: "rawg" as const,
          title: game.name,
          poster: game.background_image || null,
          year: game.released?.split("-")[0],
          releaseDate: game.released || undefined,
          rating: game.rating ? game.rating * 2 : undefined,
          overview: undefined,
        }));

        return {
          results,
          totalResults: parsedData.count || 0,
        };
      } catch (e) {
        console.error("RAWG API Error", e);
        return { results: [], totalResults: 0 };
      }
    },
    SearchGamesResponseSchema,
    { forceRefresh },
  );
}

export const searchGames = createServerFn({ method: "GET" })
  .inputValidator((data) =>
    z
      .object({
        query: z.string().min(1),
        page: z.coerce.number().default(1),
        forceRefresh: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    return searchGamesInternal(data);
  });

export async function getGameDetailsInternal(data: {
  id: string;
  forceRefresh?: boolean;
}): Promise<UnifiedMedia> {
  const { id, forceRefresh } = data;
  const cacheKey = `rawg-details-${id}`;

  return CacheService.withCache(
    cacheKey,
    "rawg",
    async () => {
      try {
        const apiKey = getRawgApiKey();
        const url = `https://api.rawg.io/api/games/${id}?key=${apiKey}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch game details");

        const item = await res.json();
        const parsedItem = RawgGameSchema.parse(item);

        const result: UnifiedMedia = {
          id: parsedItem.id.toString(),
          mediaType: "game" as const,
          source: "rawg" as const,
          title: parsedItem.name,
          poster: parsedItem.background_image || null,
          year: parsedItem.released?.split("-")[0],
          releaseDate: parsedItem.released || undefined,
          rating: parsedItem.rating ? parsedItem.rating * 2 : undefined,
          overview: undefined,
        };
        return result;
      } catch (e) {
        console.error("RAWG Details Error", e);
        throw e;
      }
    },
    UnifiedMediaSchema,
    { forceRefresh },
  );
}

export const getGameDetails = createServerFn({ method: "GET" })
  .inputValidator((data) =>
    z
      .object({
        id: z.string(),
        forceRefresh: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    return getGameDetailsInternal(data);
  });
