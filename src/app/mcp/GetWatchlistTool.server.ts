import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  discoverWatchlistItems,
  discoverWatchlistTitles,
} from "@/features/watchlists/detail/DiscoverWatchlist.server";
import { asMcpContent, asMcpError } from "./McpToolResponse.server";
import {
  itemOutputSchema,
  titleOutputSchema,
  toMcpWatchlistItem,
} from "./WatchlistReadOutput.server";

type GetWatchlistRequest = {
  watchlistId: number;
  pageSize?: number;
  cursor?: string;
  resultView?: "items" | "titles";
};

export function registerGetWatchlistTool(
  server: McpServer,
  watchlistSummaryOutputSchema: z.ZodType,
) {
  server.registerTool(
    "get_watchlist",
    {
      title: "Get watchlist",
      description:
        'Get one watchlist with summary counts and a cursor-paginated result page. Use resultView: "items" | "titles" to choose individual entries or titles that group all episodes from the same TV show and issues from the same series.',
      inputSchema: {
        watchlistId: z.coerce.number().int().positive(),
        pageSize: z.number().int().min(1).max(100).optional(),
        cursor: z.string().optional(),
        resultView: z.enum(["items", "titles"]).optional(),
      },
      outputSchema: {
        watchlist: watchlistSummaryOutputSchema,
        items: z.array(itemOutputSchema).optional(),
        titles: z.array(titleOutputSchema).optional(),
        nextCursor: z.string().optional(),
        orderToken: z.string().optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (request) => respondToGetWatchlist(request),
  );
}

function respondToGetWatchlist(request: GetWatchlistRequest) {
  return request.resultView === "titles"
    ? respondToWatchlistTitles(request)
    : respondToWatchlistItems(request);
}

async function respondToWatchlistTitles({ watchlistId, pageSize, cursor }: GetWatchlistRequest) {
  const page = await discoverWatchlistTitles({ watchlistId, pageSize, cursor });
  if (!page) return watchlistNotFound(watchlistId);
  return asMcpContent({
    watchlist: page.watchlist,
    titles: page.titles,
    nextCursor: page.nextCursor,
  });
}

async function respondToWatchlistItems({ watchlistId, pageSize, cursor }: GetWatchlistRequest) {
  const page = await discoverWatchlistItems({ watchlistId, pageSize, cursor });
  if (!page) return watchlistNotFound(watchlistId);
  return asMcpContent({
    watchlist: page.watchlist,
    items: page.items.map(toMcpWatchlistItem),
    nextCursor: page.nextCursor,
    orderToken: page.orderToken,
  });
}

function watchlistNotFound(watchlistId: number) {
  return asMcpError(`Watchlist ${watchlistId} was not found.`);
}
