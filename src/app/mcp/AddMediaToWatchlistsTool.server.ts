import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
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
  provider: z.literal("tmdb").optional(),
  providerId: z.string().optional(),
  affectedCount: z.number().int().nonnegative(),
});

const mediaAdditionInputSchema = z.object({
  watchlistId: z.number().optional(),
  provider: z.literal("tmdb").optional(),
  providerId: z.string().optional(),
  mediaType: z.enum(["movie", "tv"]).optional(),
  insertionPosition: z.enum(["beginning", "end", "release-adjacent"]).optional(),
});

export function registerAddMediaToWatchlistsTool(server: McpServer) {
  server.registerTool(
    "add_media_to_watchlists",
    {
      title: "Add TMDB movies and TV shows to watchlists",
      description:
        "Add one or more TMDB movies or TV shows by provider ID. Janus fetches canonical TMDB metadata before persisting each addition. TV additions expand into episodes, so they are consequential bulk actions requiring confirmation. Each requested addition is processed independently and returns an ordered result.",
      inputSchema: { additions: z.array(mediaAdditionInputSchema).min(1) },
      outputSchema: { results: z.array(mediaAdditionResultSchema) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ additions }) =>
      asMcpContent({
        results: await Promise.all(additions.map(addMediaResult)),
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
  const result = await addProviderMediaToWatchlist(addition);
  return {
    index,
    ...result,
    watchlistId: addition.watchlistId,
    provider: addition.provider,
    providerId: addition.providerId,
  };
}
