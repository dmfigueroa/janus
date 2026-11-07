import { executeWriteBatch } from "./ExecuteWriteBatch.server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  reorderItems,
  type ReorderFailureCode,
} from "@/features/watchlists/reorder/Mutation.server";
import { asMcpContent } from "./McpToolResponse.server";

const reorderResultSchema = z.object({
  index: z.number().int().nonnegative(),
  success: z.boolean(),
  code: z.string(),
  message: z.string(),
  watchlistId: z.number().optional(),
  movedItemId: z.number().optional(),
  referenceItemId: z.number().optional(),
});

const reorderInputSchema = z.object({
  watchlistId: z.number().int().optional(),
  movedItemId: z.number().int().optional(),
  referenceItemId: z.number().int().optional(),
  position: z.enum(["before", "after"]).optional(),
});

export function registerReorderWatchlistItemsTool(server: McpServer) {
  server.registerTool(
    "reorder_watchlist_items",
    {
      title: "Reorder watchlist items",
      description:
        "Reorder one or more watchlist items within a custom-ordered watchlist, moving each item before or after a reference item. Each reorder targets an explicit watchlist, moved item ID, reference item ID, and before-or-after position, is processed independently, and returns an ordered result. Only custom-ordered watchlists accept reorders. This changes the order of items and is consequential, so confirm before applying.",
      inputSchema: { reorders: z.array(reorderInputSchema).min(1) },
      outputSchema: { results: z.array(reorderResultSchema) },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ reorders }) =>
      asMcpContent({
        results: await executeWriteBatch(reorders, reorderResult),
      }),
  );
}

async function reorderResult(input: z.infer<typeof reorderInputSchema>, index: number) {
  if (!isValidReorderInput(input)) {
    return invalidReorderResult(input, index);
  }

  const result = await reorderItems({
    watchlistId: input.watchlistId!,
    movedItemId: input.movedItemId!,
    referenceItemId: input.referenceItemId!,
    position: input.position!,
  });

  if (!result.success) {
    return reorderFailureResult(input, index, result.code, result.message);
  }

  return {
    index,
    success: true,
    code: "reordered",
    message: "Watchlist items reordered.",
    watchlistId: input.watchlistId,
    movedItemId: input.movedItemId,
    referenceItemId: input.referenceItemId,
  };
}

function isValidReorderInput(input: z.infer<typeof reorderInputSchema>) {
  const requiredIds = [input.watchlistId, input.movedItemId, input.referenceItemId];
  return (
    requiredIds.every((value) => typeof value === "number") && isReorderPosition(input.position)
  );
}

function isReorderPosition(value: unknown) {
  return value === "before" || value === "after";
}

function invalidReorderResult(input: z.infer<typeof reorderInputSchema>, index: number) {
  return {
    index,
    success: false,
    code: "validation_error",
    message: "watchlistId, movedItemId, referenceItemId, and position are required.",
    watchlistId: input.watchlistId,
    movedItemId: input.movedItemId,
    referenceItemId: input.referenceItemId,
  };
}

function reorderFailureResult(
  input: z.infer<typeof reorderInputSchema>,
  index: number,
  code: ReorderFailureCode,
  message: string,
) {
  return {
    index,
    success: false,
    code,
    message,
    watchlistId: input.watchlistId,
    movedItemId: input.movedItemId,
    referenceItemId: input.referenceItemId,
  };
}
