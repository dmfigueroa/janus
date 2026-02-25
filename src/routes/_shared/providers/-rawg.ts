import { Effect } from "effect";
import { z } from "zod";
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

const RAWG_GAMES_URL = "https://api.rawg.io/api/games";
const RAWG_API_ERROR = "RAWG API Error";
const RAWG_DETAILS_ERROR = "RAWG Details Error";

type RawgGame = z.infer<typeof RawgGameSchema>;

function buildRawgSearchUrl(query: string, apiKey: string, page: number): URL {
  const url = new URL(RAWG_GAMES_URL);
  url.search = new URLSearchParams({
    key: apiKey,
    search: query,
    page: page.toString(),
    page_size: API_PAGE_SIZE.toString(),
  }).toString();
  return url;
}

function buildRawgDetailsUrl(id: string, apiKey: string): URL {
  const encodedId = encodeURIComponent(id);
  const url = new URL(`${RAWG_GAMES_URL}/${encodedId}`);
  url.search = new URLSearchParams({ key: apiKey }).toString();
  return url;
}

const toUnifiedGame = (game: RawgGame): UnifiedMedia => ({
  id: game.id.toString(),
  mediaType: "game",
  source: "rawg",
  title: game.name,
  poster: game.background_image ?? null,
  year: game.released?.split("-")[0],
  releaseDate: game.released ?? undefined,
  rating: game.rating != null ? game.rating * 2 : undefined,
  overview: undefined,
});

export async function searchGames(
  query: string,
  apiKey: string,
  page: number = 1,
): Promise<{ results: UnifiedMedia[]; totalResults: number }> {
  const program = Effect.gen(function* () {
    const url = buildRawgSearchUrl(query, apiKey, page);

    const rawData = yield* fetchJson({
      url,
      context: RAWG_API_ERROR,
    }).pipe(Effect.catchAll(() => Effect.succeed({ results: [], count: 0 })));
    const data = yield* parseWithSchema(RawgResponseSchema, rawData, RAWG_API_ERROR);

    return {
      results: (data.results ?? []).map(toUnifiedGame),
      totalResults: data.count ?? 0,
    };
  });

  return runServerEffect(program);
}

export async function getGameDetails(id: string, apiKey: string): Promise<UnifiedMedia> {
  const program = Effect.gen(function* () {
    const url = buildRawgDetailsUrl(id, apiKey);
    const item = yield* fetchJson({
      url,
      context: RAWG_DETAILS_ERROR,
    });
    const data = yield* parseWithSchema(RawgGameSchema, item, RAWG_DETAILS_ERROR);

    return toUnifiedGame(data);
  });

  return runServerEffect(program);
}
