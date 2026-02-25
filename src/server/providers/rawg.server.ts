import { z } from "zod";
import { API_PAGE_SIZE } from "../constants";
import { type UnifiedMedia } from "../media";
import { getErrorMessage } from "../utils";

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

export async function searchGames(
  query: string,
  apiKey: string,
  page: number = 1,
): Promise<{ results: UnifiedMedia[]; totalResults: number }> {
  try {
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
    const data = RawgResponseSchema.parse(rawData);

    const results = (data.results || []).map((game) => ({
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
      totalResults: data.count || 0,
    };
  } catch (e) {
    const errorMessage = getErrorMessage(e);
    console.error("RAWG API Error:", errorMessage);
    throw new Error(`RAWG API Error: ${errorMessage}`);
  }
}

export async function getGameDetails(id: string, apiKey: string) {
  try {
    const url = `https://api.rawg.io/api/games/${id}?key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch game details");

    const item = await res.json();
    const data = RawgGameSchema.parse(item);

    return {
      id: data.id.toString(),
      mediaType: "game" as const,
      source: "rawg" as const,
      title: data.name,
      poster: data.background_image || null,
      year: data.released?.split("-")[0],
      releaseDate: data.released || undefined,
      rating: data.rating ? data.rating * 2 : undefined,
      overview: undefined,
    };
  } catch (e) {
    const errorMessage = getErrorMessage(e);
    console.error("RAWG Details Error:", errorMessage);
    throw new Error(`RAWG Details Error: ${errorMessage}`);
  }
}
