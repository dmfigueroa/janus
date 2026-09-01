import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

type McpSession = {
  server: McpServer;
  transport: WebStandardStreamableHTTPServerTransport;
  lastActiveAt: number;
};

const sessionIdleDurationMs = 15 * 60 * 1000;
const sessions = new Map<string, McpSession>();

export async function handleMcpSessionRequest(request: Request, createServer: () => McpServer) {
  removeExpiredSessions();

  const sessionId = request.headers.get("mcp-session-id");
  const session = sessions.get(sessionId ?? "");

  if (session) {
    session.lastActiveAt = Date.now();
    return session.transport.handleRequest(request);
  }

  return handleMissingSession(request, sessionId, createServer);
}

function removeExpiredSessions() {
  const expirationTime = Date.now() - sessionIdleDurationMs;

  sessions.forEach((session, sessionId) => {
    if (session.lastActiveAt < expirationTime) {
      sessions.delete(sessionId);
    }
  });
}

function handleMissingSession(
  request: Request,
  sessionId: string | null,
  createServer: () => McpServer,
) {
  return sessionId === null
    ? handleNewSession(request, createServer)
    : Promise.resolve(new Response("MCP session not found", { status: 404 }));
}

async function handleNewSession(request: Request, createServer: () => McpServer) {
  let pendingSession: McpSession | undefined;
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    onsessioninitialized: (sessionId) => {
      if (pendingSession) {
        sessions.set(sessionId, pendingSession);
      }
    },
    onsessionclosed: (sessionId) => {
      sessions.delete(sessionId);
    },
    enableJsonResponse: true,
  });
  const server = createServer();
  pendingSession = { server, transport, lastActiveAt: Date.now() };

  await server.connect(transport);
  return transport.handleRequest(request);
}
