import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { moveParentToWatchlistMutation } from "@/features/watchlists/move/ParentMutation.server";
import {
  anchorReferenceRefinement,
  moveInsertionPositionSchema,
} from "@/features/watchlists/move/Schema";
import { asMcpContent } from "./McpToolResponse.server";

const moveParentResultSchema = z.object({
  index: z.number().int().nonnegative(),
  success: z.boolean(),
  code: z.string(),
  message: z.string(),
  watchlistId: z.number().optional(),
  parentId: z.string().optional(),
  destinationWatchlistId: z.number().optional(),
  affectedCount: z.number().optional(),
});

const moveParentInputSchema = z
  .object({
    watchlistId: z.number().int().optional(),
    parentId: z.string().optional(),
    destinationWatchlistId: z.number().int().optional(),
    position: moveInsertionPositionSchema.optional(),
    referenceItemId: z.number().int().positive().optional(),
  })
  .superRefine(anchorReferenceRefinement);

export function registerMoveWatchlistParentsTool(server: McpServer) {
  server.registerTool(
    "move_watchlist_parents",
    {
      title: "Move whole watchlist parent groups",
      description:
        "Move every watchlist item belonging to one or more parents, such as all episodes of a TV series, from an explicit watchlist to an explicit destination watchlist as one requested operation. Each move targets a source watchlist and parent identity, moves the parent and its children together, and is processed independently, returning an ordered result that reports the parent and the number of items moved. Janus preserves its duplicate-prevention and destination-ordering rules: a custom-ordered destination requires an explicit position (beginning, end, before, or after), and a duplicate target is rejected without changing the source. This is a bulk operation and is distinct from move_watchlist_items, which moves a single item at a time.",
      inputSchema: { moves: z.array(moveParentInputSchema).min(1) },
      outputSchema: { results: z.array(moveParentResultSchema) },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ moves }) => {
      const results: Array<Awaited<ReturnType<typeof moveParentResult>>> = [];
      for (const [index, move] of moves.entries()) {
        results.push(await moveParentResult(move, index));
      }
      return asMcpContent({ results });
    },
  );
}

async function moveParentResult(input: z.infer<typeof moveParentInputSchema>, index: number) {
  if (!isValidMoveParentInput(input)) {
    return invalidMoveParentResult(input, index);
  }

  const result = await moveParentToWatchlistMutation({
    watchlistId: input.watchlistId!,
    parentId: input.parentId!,
    destinationWatchlistId: input.destinationWatchlistId!,
    position: input.position,
    referenceItemId: input.referenceItemId,
  });

  if (!result.success) {
    return moveParentFailureResult(input, index, result.code, result.message);
  }

  return {
    index,
    success: true,
    code: "moved",
    message: result.message,
    watchlistId: input.watchlistId,
    parentId: input.parentId,
    destinationWatchlistId: input.destinationWatchlistId,
    affectedCount: result.movedCount,
  };
}

function isValidMoveParentInput(input: z.infer<typeof moveParentInputSchema>) {
  return (
    typeof input.watchlistId === "number" &&
    typeof input.parentId === "string" &&
    typeof input.destinationWatchlistId === "number"
  );
}

function invalidMoveParentResult(input: z.infer<typeof moveParentInputSchema>, index: number) {
  return {
    index,
    success: false,
    code: "validation_error",
    message: "watchlistId, parentId, and destinationWatchlistId are required.",
    watchlistId: input.watchlistId,
    parentId: input.parentId,
    destinationWatchlistId: input.destinationWatchlistId,
    affectedCount: 0,
  };
}

function moveParentFailureResult(
  input: z.infer<typeof moveParentInputSchema>,
  index: number,
  code: string,
  message: string,
) {
  return {
    index,
    success: false,
    code,
    message,
    watchlistId: input.watchlistId,
    parentId: input.parentId,
    destinationWatchlistId: input.destinationWatchlistId,
    affectedCount: 0,
  };
}
