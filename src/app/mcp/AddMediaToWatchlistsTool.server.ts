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
import { serializeError, serverLogger } from "@/shared/logging/ServerLog.server";

const mediaAdditionResultSchema = z.object({
  index: z.number().int().nonnegative(),
  success: z.boolean(),
  code: z.string(),
  message: z.string(),
  watchlistId: z.number().optional(),
  provider: z.enum(["tmdb", "rawg", "google_books", "comicvine", "anilist"]).optional(),
  providerId: z.string().optional(),
  affectedCount: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe(
      "Number of items added when known; omitted when an unexpected failure leaves the count unknown.",
    ),
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
        results: await executeWriteBatch(additions, addMediaResult, "add_media_to_watchlists"),
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
  const startedAt = performance.now();
  const result = await addProviderMediaToWatchlist(addition).catch((error: unknown) => {
    serverLogger("error", "mcp.operation.failed", {
      tool: "add_media_to_watchlists",
      operation: "add_media",
      index,
      watchlistId: addition.watchlistId,
      provider: addition.provider,
      outcome: "internal_error",
      durationMs: Math.round(performance.now() - startedAt),
      error: serializeError(error),
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
