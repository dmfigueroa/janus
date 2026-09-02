import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { toggleWatchedMutation } from "@/features/watchlists/toggle/Mutation.server";
import { asMcpContent } from "./McpToolResponse.server";

const watchedUpdateResultSchema = z.object({
  index: z.number().int().nonnegative(),
  success: z.boolean(),
  code: z.string(),
  message: z.string(),
  watchlistItemId: z.number().optional(),
});

const watchedUpdateInputSchema = z.object({
  watchlistItemId: z.number().optional(),
  isWatched: z.boolean().optional(),
  updateWatchlistRecency: z.boolean().optional(),
});

export function registerSetWatchlistItemsWatchedTool(server: McpServer) {
  server.registerTool(
    "set_watchlist_items_watched",
    {
      title: "Set watchlist items watched state",
      description:
        "Set one or more watchlist items to an explicit watched or unwatched state using the required isWatched flag rather than a toggle. Each update targets a stable internal watchlist item ID and is processed independently, returning an ordered result. Optionally control whether marking an item watched updates the destination watchlist's recency behavior.",
      inputSchema: { updates: z.array(watchedUpdateInputSchema).min(1) },
      outputSchema: { results: z.array(watchedUpdateResultSchema) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ updates }) =>
      asMcpContent({
        results: await Promise.all(updates.map(setWatchedResult)),
      }),
  );
}

async function setWatchedResult(input: z.infer<typeof watchedUpdateInputSchema>, index: number) {
  if (!isValidWatchedUpdate(input)) return invalidWatchedUpdateResult(input, index);

  const result = await toggleWatchedMutation({
    itemId: input.watchlistItemId!,
    isWatched: input.isWatched!,
    updateWatchlistRecency: input.updateWatchlistRecency,
  });
  if (!result.success) return watchedNotFoundResult(index, input, result.message);

  return {
    index,
    success: true,
    code: "watched_updated",
    message: "Watchlist item watched state updated.",
    watchlistItemId: input.watchlistItemId,
  };
}

function isValidWatchedUpdate(input: z.infer<typeof watchedUpdateInputSchema>) {
  return typeof input.watchlistItemId === "number" && typeof input.isWatched === "boolean";
}

function invalidWatchedUpdateResult(
  input: z.infer<typeof watchedUpdateInputSchema>,
  index: number,
) {
  return {
    index,
    success: false,
    code: "validation_error",
    message: "watchlistItemId and isWatched are required.",
    watchlistItemId: input.watchlistItemId,
  };
}

function watchedNotFoundResult(
  index: number,
  input: z.infer<typeof watchedUpdateInputSchema>,
  message: string,
) {
  return {
    index,
    success: false,
    code: "not_found",
    message,
    watchlistItemId: input.watchlistItemId,
  };
}
