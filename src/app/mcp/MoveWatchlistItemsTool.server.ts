import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { moveItemToWatchlistMutation } from "@/features/watchlists/move/Mutation.server";
import {
  anchorReferenceRefinement,
  moveInsertionPositionSchema,
} from "@/features/watchlists/move/Schema";
import { asMcpContent } from "./McpToolResponse.server";

const moveItemResultSchema = z.object({
  index: z.number().int().nonnegative(),
  success: z.boolean(),
  code: z.string(),
  message: z.string(),
  watchlistItemId: z.number().optional(),
  destinationWatchlistId: z.number().optional(),
  affectedCount: z.number().optional(),
});

const moveItemInputSchema = z
  .object({
    watchlistItemId: z.number().int().optional(),
    destinationWatchlistId: z.number().int().optional(),
    position: moveInsertionPositionSchema.optional(),
    referenceItemId: z.number().int().positive().optional(),
  })
  .superRefine(anchorReferenceRefinement);

export function registerMoveWatchlistItemsTool(server: McpServer) {
  server.registerTool(
    "move_watchlist_items",
    {
      title: "Move watchlist items",
      description:
        "Move one or more individual watchlist items from their current watchlist to an explicit destination watchlist by their stable internal Janus watchlist item ID. Each move targets a single item, never moves sibling items or the whole parent group, and is processed independently, returning an ordered result. Janus preserves its duplicate-prevention and destination-ordering rules: a custom-ordered destination requires an explicit position (beginning, end, before, or after), and a duplicate target is rejected without changing the source. To move every item of a series or other parent together, use move_watchlist_parents instead.",
      inputSchema: { moves: z.array(moveItemInputSchema).min(1) },
      outputSchema: { results: z.array(moveItemResultSchema) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ moves }) => {
      const results: Array<Awaited<ReturnType<typeof moveItemResult>>> = [];
      for (const [index, move] of moves.entries()) {
        results.push(await moveItemResult(move, index));
      }
      return asMcpContent({ results });
    },
  );
}

async function moveItemResult(input: z.infer<typeof moveItemInputSchema>, index: number) {
  if (!isValidMoveItemInput(input)) {
    return invalidMoveItemResult(input, index);
  }

  const result = await moveItemToWatchlistMutation({
    itemId: input.watchlistItemId!,
    destinationWatchlistId: input.destinationWatchlistId!,
    position: input.position,
    referenceItemId: input.referenceItemId,
  });

  if (!result.success) {
    return moveItemFailureResult(input, index, result.code, result.message);
  }

  return {
    index,
    success: true,
    code: "moved",
    message: result.message,
    watchlistItemId: input.watchlistItemId,
    destinationWatchlistId: input.destinationWatchlistId,
    affectedCount: result.movedCount,
  };
}

function isValidMoveItemInput(input: z.infer<typeof moveItemInputSchema>) {
  return (
    typeof input.watchlistItemId === "number" && typeof input.destinationWatchlistId === "number"
  );
}

function invalidMoveItemResult(input: z.infer<typeof moveItemInputSchema>, index: number) {
  return {
    index,
    success: false,
    code: "validation_error",
    message: "watchlistItemId and destinationWatchlistId are required.",
    watchlistItemId: input.watchlistItemId,
    destinationWatchlistId: input.destinationWatchlistId,
    affectedCount: 0,
  };
}

function moveItemFailureResult(
  input: z.infer<typeof moveItemInputSchema>,
  index: number,
  code: string,
  message: string,
) {
  return {
    index,
    success: false,
    code,
    message,
    watchlistItemId: input.watchlistItemId,
    destinationWatchlistId: input.destinationWatchlistId,
    affectedCount: 0,
  };
}
