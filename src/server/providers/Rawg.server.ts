import { requestProviderJson, parseProviderData } from "@/integrations/ProviderRequest.server";
import { z } from "zod";
import { API_PAGE_SIZE } from "../Constants";
import { type UnifiedMedia } from "../Media";
import { getErrorMessage } from "../Utils";

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

type RawgGame = z.infer<typeof RawgGameSchema>;

function getGamePoster(image: string | null | undefined) {
  return image || null;
}

function getGameReleaseDate(released: string | null | undefined) {
  return released || undefined;
}

function mapGame(game: RawgGame): UnifiedMedia & { mediaType: "game" } {
  return {
    id: game.id.toString(),
    mediaType: "game",
    source: "rawg",
    title: game.name,
    poster: getGamePoster(game.background_image),
    year: game.released?.split("-")[0],
    releaseDate: getGameReleaseDate(game.released),
    rating: getGameRating(game.rating),
    overview: undefined,
  };
}

function getGameRating(rating: number | undefined) {
  return rating ? rating * 2 : undefined;
}

function formatGameSearch(data: z.infer<typeof RawgResponseSchema>) {
  return {
    results: (data.results || []).map(mapGame),
    totalResults: data.count || 0,
  };
}

async function searchGamesRequest(query: string, apiKey: string, page: number) {
  const pageSize = API_PAGE_SIZE;
  const url = new URL("https://api.rawg.io/api/games");
  url.search = new URLSearchParams({
    key: apiKey,
    search: query,
    page: page.toString(),
    page_size: pageSize.toString(),
  }).toString();

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`RAWG search request failed: ${res.status}`);

  const rawData = await res.json();
  const data = RawgResponseSchema.parse(rawData);
  return formatGameSearch(data);
}

async function getGameDetailsRequest(id: string, apiKey: string) {
  const url = `https://api.rawg.io/api/games/${id}?key=${apiKey}`;
  const item = await requestProviderJson(url);
  return mapGame(parseProviderData(RawgGameSchema, item));
}

export async function searchGames(
  query: string,
  apiKey: string,
  page: number = 1,
): Promise<{ results: UnifiedMedia[]; totalResults: number }> {
  try {
    return await searchGamesRequest(query, apiKey, page);
  } catch (e) {
    const errorMessage = getErrorMessage(e);
    console.error("RAWG API Error:", errorMessage);
    throw new Error(`RAWG API Error: ${errorMessage}`);
  }
}

export async function getGameDetails(id: string, apiKey: string) {
  return getGameDetailsRequest(id, apiKey);
}
