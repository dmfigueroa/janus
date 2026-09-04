import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  setWatchlistOrder,
  type SetWatchlistOrderFailureCode,
} from "@/features/watchlists/order/SetWatchlistOrder.server";
import { setWatchlistOrderSchema } from "@/features/watchlists/order/SetWatchlistOrderSchema";
import { asMcpContent } from "./McpToolResponse.server";

const resultSchema = z.object({
  success: z.boolean(),
  code: z.string(),
  message: z.string(),
  watchlistId: z.number(),
  orderToken: z.string().optional(),
});

export function registerSetWatchlistOrderTool(server: McpServer) {
  server.registerTool(
    "set_watchlist_order",
    {
      title: "Set complete watchlist order",
      description:
        "Set the complete order of every item in a custom-ordered watchlist in one atomic operation. orderedItemIds must contain every watchlist item exactly once, from first to last. Use the orderToken returned by get_watchlist as expectedOrderToken to prevent overwriting a newer user change. This is consequential and requires confirmation before applying.",
      inputSchema: setWatchlistOrderSchema.shape,
      outputSchema: { ...resultSchema.shape },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async (input) => {
      const result = await setWatchlistOrder(input);
      if (!result.success) return asMcpContent(toFailureResponse(input.watchlistId, result));

      return asMcpContent({
        success: true,
        code: "order_set",
        message: "Watchlist order set.",
        watchlistId: input.watchlistId,
        orderToken: result.orderToken,
      });
    },
  );
}

function toFailureResponse(
  watchlistId: number,
  result: Extract<Awaited<ReturnType<typeof setWatchlistOrder>>, { success: false }>,
) {
  const code: SetWatchlistOrderFailureCode = result.code;
  return {
    success: false,
    code,
    message: result.message,
    watchlistId,
    orderToken: result.orderToken,
  };
}
