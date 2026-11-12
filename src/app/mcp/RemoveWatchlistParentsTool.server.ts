import { executeWriteBatch } from "./ExecuteWriteBatch.server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { removeWatchlistParentMutation } from "@/features/watchlists/remove/RemoveFromWatchlist.server";
import { asMcpContent } from "./McpToolResponse.server";

const parentRemovalResultSchema = z.object({
  index: z.number().int().nonnegative(),
  success: z.boolean(),
  code: z.string(),
  message: z.string(),
  watchlistId: z.number().optional(),
  parentId: z.string().optional(),
  affectedCount: z.number().optional(),
});

const parentRemovalInputSchema = z.object({
  watchlistId: z.number().int().optional(),
  parentId: z.string().optional(),
});

export function registerRemoveWatchlistParentsTool(server: McpServer) {
  server.registerTool(
    "remove_watchlist_parents",
    {
      title: "Remove whole watchlist parent groups",
      description:
        "Remove every watchlist item belonging to one or more parents, such as all episodes of a TV series, from an explicit watchlist. Each removal targets a watchlist and parent identity and is processed independently, returning an ordered result that reports the parent and the number of items removed. This is irreversible and removes all items of the selected parent; it is distinct from remove_watchlist_items, which removes a single item at a time.",
      inputSchema: { removals: z.array(parentRemovalInputSchema).min(1) },
      outputSchema: { results: z.array(parentRemovalResultSchema) },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ removals }) =>
      asMcpContent({
        results: await executeWriteBatch(removals, removeWatchlistParentResult),
      }),
  );
}

async function removeWatchlistParentResult(
  input: z.infer<typeof parentRemovalInputSchema>,
  index: number,
) {
  if (typeof input.watchlistId !== "number" || typeof input.parentId !== "string") {
    return invalidParentRemovalResult(input, index);
  }

  const result = await removeWatchlistParentMutation({
    watchlistId: input.watchlistId,
    parentId: input.parentId,
  });

  return {
    index,
    success: true,
    code: "removed",
    message: result.message,
    watchlistId: input.watchlistId,
    parentId: input.parentId,
    affectedCount: result.removedCount,
  };
}

function invalidParentRemovalResult(
  input: z.infer<typeof parentRemovalInputSchema>,
  index: number,
) {
  return {
    index,
    success: false,
    code: "validation_error",
    message: "watchlistId and parentId are required.",
    watchlistId: input.watchlistId,
    parentId: input.parentId,
    affectedCount: 0,
  };
}
