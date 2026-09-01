import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  listWatchlistSummaryPage,
  searchWatchlistSummaryPage,
} from "@/features/watchlists/list/Query.server";
import { handleMcpSessionRequest } from "@/integrations/mcp/McpSessionTransport.server";

const watchlistSummaryOutputSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  itemOrderMode: z.enum(["release", "custom"]),
  createdAt: z.string(),
  updatedAt: z.string().nullable(),
  lastWatchedAt: z.string().nullable(),
  lastItemAddedAt: z.string().nullable(),
  stats: z.object({
    totalItems: z.number(),
    watchedItems: z.number(),
    progress: z.number(),
    nextUnwatched: z.unknown().nullable(),
    coverImage: z.string().nullable(),
    coverMediaType: z
      .enum(["movie", "episode", "game", "book", "comic", "anime", "manga"])
      .nullable(),
  }),
});

const watchlistPageInputSchema = {
  orderBy: z.enum(["createdAt", "lastWatched", "lastAdded"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
};

export function handleMcpEndpointRequest(request: Request) {
  return handleMcpSessionRequest(request, createMcpServer);
}

function createMcpServer() {
  const server = new McpServer({ name: "janus", version: "1.0.0" });

  server.registerTool(
    "list_watchlists",
    {
      title: "List watchlists",
      description: "List watchlist summaries using Janus's supported sort order.",
      inputSchema: watchlistPageInputSchema,
      outputSchema: {
        watchlists: z.array(watchlistSummaryOutputSchema),
        nextCursor: z.string().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async ({ orderBy, order, pageSize, cursor }) => {
      const page = await listWatchlistSummaryPage({ orderBy, order, pageSize, cursor });

      return asMcpContent(page);
    },
  );

  server.registerTool(
    "search_watchlists",
    {
      title: "Search watchlists",
      description: "Find watchlist summaries by a case-insensitive partial name.",
      inputSchema: {
        query: z.string().trim().min(1),
        ...watchlistPageInputSchema,
      },
      outputSchema: {
        watchlists: z.array(watchlistSummaryOutputSchema),
        nextCursor: z.string().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async ({ query, orderBy, order, pageSize, cursor }) => {
      const page = await searchWatchlistSummaryPage({ query, orderBy, order, pageSize, cursor });

      return asMcpContent(page);
    },
  );

  return server;
}

function asMcpContent(page: { watchlists: unknown[]; nextCursor?: string }) {
  return {
    structuredContent: page,
    content: [{ type: "text" as const, text: JSON.stringify(page) }],
  };
}
