import { executeWriteBatch } from "./ExecuteWriteBatch.server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { removeWatchlistItemMutation } from "@/features/watchlists/remove/RemoveFromWatchlist.server";
import { asMcpContent } from "./McpToolResponse.server";

const itemRemovalResultSchema = z.object({
  index: z.number().int().nonnegative(),
  success: z.boolean(),
  code: z.string(),
  message: z.string(),
  watchlistId: z.number().optional(),
  watchlistItemId: z.number().optional(),
  affectedCount: z.number().optional(),
});

const itemRemovalInputSchema = z.object({
  watchlistId: z.number().int().optional(),
  watchlistItemId: z.number().int().optional(),
});

export function registerRemoveWatchlistItemsTool(server: McpServer) {
  server.registerTool(
    "remove_watchlist_items",
    {
      title: "Remove watchlist items",
      description:
        "Remove one or more individual watchlist items from a watchlist by their stable internal Janus watchlist item ID. Each removal targets a single item within an explicit watchlist and never removes sibling items or every item belonging to a parent; it is processed independently and returns an ordered result. This is irreversible; removed items cannot be restored. To remove every item of a series or other parent, use remove_watchlist_parents instead.",
      inputSchema: { removals: z.array(itemRemovalInputSchema).min(1) },
      outputSchema: { results: z.array(itemRemovalResultSchema) },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ removals }) =>
      asMcpContent({
        results: await executeWriteBatch(
          removals,
          removeWatchlistItemResult,
          "remove_watchlist_items",
        ),
      }),
  );
}

async function removeWatchlistItemResult(
  input: z.infer<typeof itemRemovalInputSchema>,
  index: number,
) {
  if (typeof input.watchlistId !== "number" || typeof input.watchlistItemId !== "number") {
    return invalidItemRemovalResult(input, index);
  }

  const result = await removeWatchlistItemMutation({
    watchlistId: input.watchlistId,
    itemId: input.watchlistItemId,
  });

  return {
    index,
    success: true,
    code: "removed",
    message: result.message,
    watchlistId: input.watchlistId,
    watchlistItemId: input.watchlistItemId,
    affectedCount: result.removedCount,
  };
}

function invalidItemRemovalResult(input: z.infer<typeof itemRemovalInputSchema>, index: number) {
  return {
    index,
    success: false,
    code: "validation_error",
    message: "watchlistId and watchlistItemId are required.",
    watchlistId: input.watchlistId,
    watchlistItemId: input.watchlistItemId,
    affectedCount: 0,
  };
}
