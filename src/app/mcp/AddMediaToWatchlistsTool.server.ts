import { executeWriteBatch } from "./ExecuteWriteBatch.server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { anchorInsertionRefinement } from "@/features/watchlists/add/InsertionRefinement";
import {
  providerMediaAdditionSchema,
  type ProviderMediaAddition,
} from "@/features/watchlists/add/AddProviderMedia";
import { addProviderMediaToWatchlist } from "@/features/watchlists/add/AddProviderMedia.server";
import { asMcpContent } from "./McpToolResponse.server";

const mediaAdditionResultSchema = z.object({
  index: z.number().int().nonnegative(),
  success: z.boolean(),
  code: z.string(),
  message: z.string(),
  watchlistId: z.number().optional(),
  provider: z.enum(["tmdb", "rawg", "google_books", "comicvine", "anilist"]).optional(),
  providerId: z.string().optional(),
  affectedCount: z.number().int().nonnegative(),
});

const mediaAdditionInputSchema = z
  .object({
    watchlistId: z.number().optional(),
    provider: z.enum(["tmdb", "rawg", "google_books", "comicvine", "anilist"]).optional(),
    providerId: z.string().optional(),
    mediaType: z
      .enum(["movie", "tv", "episode", "game", "book", "comic", "comic_issue", "anime", "manga"])
      .optional(),
    parent: z
      .object({
        providerId: z.string().optional(),
        title: z.string().optional(),
      })
      .optional(),
    insertionPosition: z.enum(["beginning", "end", "before", "after"]).optional(),
    referenceItemId: z.number().int().positive().optional(),
  })
  .superRefine(anchorInsertionRefinement);

export function registerAddMediaToWatchlistsTool(server: McpServer) {
  server.registerTool(
    "add_media_to_watchlists",
    {
      title: "Add provider-backed media to watchlists",
      description:
        'Add TMDB movies, TV, or individual episodes; RAWG games; Google Books books; or ComicVine volumes or individual issues by provider ID. Janus fetches canonical provider metadata before persisting each addition. TMDB episode additions require their parent show ID. A ComicVine item copied from read tool results (mediaType "comic" with its parent volume) adds that single issue; a "comic" addition without a parent adds the whole volume. Anime and manga additions remain unavailable. TV additions expand into episodes, and ComicVine volume additions expand into issues, so they are consequential bulk actions requiring confirmation. Each requested addition is processed independently in input order and returns an ordered result.',
      inputSchema: { additions: z.array(mediaAdditionInputSchema).min(1) },
      outputSchema: { results: z.array(mediaAdditionResultSchema) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ additions }) =>
      asMcpContent({
        results: await executeWriteBatch(additions, addMediaResult),
      }),
  );
}

async function addMediaResult(input: z.infer<typeof mediaAdditionInputSchema>, index: number) {
  const parsedInput = providerMediaAdditionSchema.safeParse(input);
  if (!parsedInput.success) {
    return invalidMediaAdditionResult(input, index, parsedInput.error);
  }

  return mediaAdditionResult(parsedInput.data, index);
}

function invalidMediaAdditionResult(
  input: z.infer<typeof mediaAdditionInputSchema>,
  index: number,
  error: z.ZodError,
) {
  return {
    index,
    success: false,
    code: "validation_error",
    message: error.issues[0]?.message ?? "Invalid media addition.",
    watchlistId: input.watchlistId,
    provider: input.provider,
    providerId: input.providerId,
    affectedCount: 0,
  };
}

async function mediaAdditionResult(addition: ProviderMediaAddition, index: number) {
  const result = await addProviderMediaToWatchlist(addition).catch((error: unknown) => {
    // Provider URLs can contain credentials. Log identifiers, never raw request errors.
    console.error("Provider watchlist addition failed", {
      watchlistId: addition.watchlistId,
      provider: addition.provider,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return {
      success: false as const,
      code: "internal_error",
      message: "The addition failed unexpectedly.",
      affectedCount: 0,
    };
  });
  return {
    index,
    ...result,
    watchlistId: addition.watchlistId,
    provider: addition.provider,
    providerId: addition.providerId,
  };
}
