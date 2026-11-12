import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import { registerFindWatchlistItemsTool } from "./FindWatchlistItemsTool.server";
import { registerGetWatchlistTool } from "./GetWatchlistTool.server";

export function registerWatchlistItemReadTools(
  server: McpServer,
  watchlistSummaryOutputSchema: z.ZodType,
) {
  registerFindWatchlistItemsTool(server);
  registerGetWatchlistTool(server, watchlistSummaryOutputSchema);
}
