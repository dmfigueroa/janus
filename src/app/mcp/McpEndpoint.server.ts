import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listWatchlistSummaryPage } from "@/features/watchlists/list/Query.server";
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
      inputSchema: {
        orderBy: z.enum(["createdAt", "lastWatched", "lastAdded"]).optional(),
        order: z.enum(["asc", "desc"]).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
        cursor: z.string().optional(),
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
    async ({ orderBy, order, pageSize, cursor }) => {
      const page = await listWatchlistSummaryPage({ orderBy, order, pageSize, cursor });

      return {
        structuredContent: page,
        content: [{ type: "text", text: JSON.stringify(page) }],
      };
    },
  );

  return server;
}
