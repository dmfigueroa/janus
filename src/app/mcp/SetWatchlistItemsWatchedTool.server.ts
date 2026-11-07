import { executeWriteBatch } from "./ExecuteWriteBatch.server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { setWatchedStateMutation } from "@/features/watchlists/lifecycle/WatchlistLifecycle.server";
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
        "Set watched state for one or more watchlist items by ID. Returns ordered, independent results. Recency updates only when an item changes to watched, unless disabled.",
      inputSchema: { updates: z.array(watchedUpdateInputSchema).min(1) },
      outputSchema: { results: z.array(watchedUpdateResultSchema) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ updates }) =>
      asMcpContent({
        results: await executeWriteBatch(updates, setWatchedResult),
      }),
  );
}

async function setWatchedResult(input: z.infer<typeof watchedUpdateInputSchema>, index: number) {
  if (!isValidWatchedUpdate(input)) return invalidWatchedUpdateResult(input, index);

  const result = await setWatchedStateMutation({
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
