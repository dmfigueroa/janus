import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  runWithServerLogContext,
  serializeError,
  serverLogger,
} from "@/shared/logging/ServerLog.server";

type McpSession = {
  server: McpServer;
  transport: WebStandardStreamableHTTPServerTransport;
  lastActiveAt: number;
};

const sessionIdleDurationMs = 15 * 60 * 1000;
const sessions = new Map<string, McpSession>();

export async function handleMcpSessionRequest(request: Request, createServer: () => McpServer) {
  const context = {
    requestId: resolveRequestId(request.headers.get("x-request-id")),
    sessionId: request.headers.get("mcp-session-id") ?? undefined,
    transport: "mcp",
  };

  return runWithServerLogContext(context, () => handleSessionRequest(request, createServer));
}

function resolveRequestId(header: string | null) {
  const candidate = (header ?? "").trim();
  return isCorrelationId(candidate) ? candidate : crypto.randomUUID();
}

function isCorrelationId(value: string) {
  return value.length > 0 && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value);
}

function handleSessionRequest(request: Request, createServer: () => McpServer) {
  removeExpiredSessions();

  const sessionId = request.headers.get("mcp-session-id");
  const session = sessions.get(sessionId ?? "");

  if (session) {
    session.lastActiveAt = Date.now();
    return handleRequestFailure(session.transport.handleRequest(request));
  }

  return handleRequestFailure(handleMissingSession(request, sessionId, createServer));
}

function handleRequestFailure(pending: Promise<Response>) {
  return pending.catch((error: unknown) => {
    serverLogger("error", "mcp.request.failed", {
      outcome: "internal_error",
      error: serializeError(error),
    });
    throw error;
  });
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
