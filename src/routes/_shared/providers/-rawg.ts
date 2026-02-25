import { z } from "zod";
import { Effect } from "effect";
import { API_PAGE_SIZE } from "../-constants";
import { type UnifiedMedia } from "../-media";
import { fetchJson, parseWithSchema, runServerEffect } from "../-effect";

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

const toUnifiedGame = (game: z.infer<typeof RawgGameSchema>): UnifiedMedia => ({
  id: game.id.toString(),
  mediaType: "game",
  source: "rawg",
  title: game.name,
  poster: game.background_image || null,
  year: game.released?.split("-")[0],
  releaseDate: game.released || undefined,
  rating: game.rating ? game.rating * 2 : undefined,
  overview: undefined,
});

export async function searchGames(
  query: string,
  apiKey: string,
  page: number = 1,
): Promise<{ results: UnifiedMedia[]; totalResults: number }> {
  const program = Effect.gen(function* () {
    const pageSize = API_PAGE_SIZE;
    const url = new URL("https://api.rawg.io/api/games");
    url.search = new URLSearchParams({
      key: apiKey,
      search: query,
      page: page.toString(),
      page_size: pageSize.toString(),
    }).toString();

    const rawData = yield* fetchJson({
      url,
      context: "RAWG API Error",
    }).pipe(Effect.catchAll(() => Effect.succeed({ results: [], count: 0 })));
    const data = yield* parseWithSchema(RawgResponseSchema, rawData, "RAWG API Error");

    return {
      results: (data.results || []).map(toUnifiedGame),
      totalResults: data.count || 0,
    };
  });

  return runServerEffect(program);
}

export async function getGameDetails(id: string, apiKey: string) {
  const program = Effect.gen(function* () {
    const url = `https://api.rawg.io/api/games/${id}?key=${apiKey}`;
    const item = yield* fetchJson({
      url,
      context: "RAWG Details Error",
    });
    const data = yield* parseWithSchema(RawgGameSchema, item, "RAWG Details Error");

    return toUnifiedGame(data);
  });

  return runServerEffect(program);
}
