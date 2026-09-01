import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { listWatchlistSummaryPage } from "@/features/watchlists/list/Query.server";

type McpSession = {
  server: McpServer;
  transport: WebStandardStreamableHTTPServerTransport;
};

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

const sessions = new Map<string, McpSession>();

export async function handleMcpRequest(request: Request) {
  const sessionId = request.headers.get("mcp-session-id");
  const session = sessions.get(sessionId ?? "");

  if (session) {
    return session.transport.handleRequest(request);
  }

  return handleMissingSession(request, sessionId);
}

function handleMissingSession(request: Request, sessionId: string | null) {
  return sessionId === null
    ? handleNewSession(request)
    : Promise.resolve(new Response("MCP session not found", { status: 404 }));
}

async function handleNewSession(request: Request) {
  let pendingSession: McpSession | undefined;
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    onsessioninitialized: (initializedSessionId) => {
      if (pendingSession) {
        sessions.set(initializedSessionId, pendingSession);
      }
    },
    onsessionclosed: (closedSessionId) => {
      sessions.delete(closedSessionId);
    },
    enableJsonResponse: true,
  });
  const server = createMcpServer();
  pendingSession = { server, transport };

  await server.connect(transport);
  return transport.handleRequest(request);
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
