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

type SessionSlot = {
  session?: McpSession;
  registeredSessionId?: string;
};

type Closeable = { close: () => Promise<void> };

const sessionIdleDurationMs = 15 * 60 * 1000;
const maxConcurrentMcpSessions = 64;
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

async function handleSessionRequest(request: Request, createServer: () => McpServer) {
  await removeExpiredSessions();

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
    return internalErrorResponse();
  });
}

function internalErrorResponse() {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32603, message: "Internal error" },
      id: null,
    }),
    { status: 500, headers: { "content-type": "application/json" } },
  );
}

async function removeExpiredSessions() {
  const expirationTime = Date.now() - sessionIdleDurationMs;
  for (const sessionId of expiredSessionIds(expirationTime)) {
    await removeSession(sessionId);
  }
}

function expiredSessionIds(expirationTime: number) {
  const sessionIds: string[] = [];
  for (const [sessionId, session] of sessions) {
    if (session.lastActiveAt < expirationTime) {
      sessionIds.push(sessionId);
    }
  }
  return sessionIds;
}

async function removeSession(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) return;
  const closed = closeSession(session);
  sessions.delete(sessionId);
  await closed;
}

function closeSession(session: McpSession) {
  return Promise.all([
    closeQuietly(session.transport, "transport"),
    closeQuietly(session.server, "server"),
  ]);
}

function closeQuietly(resource: Closeable, component: string) {
  return resource.close().catch((error: unknown) => {
    serverLogger("error", "mcp.session.close_failed", {
      outcome: "internal_error",
      component,
      error: serializeError(error),
    });
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
  const slot: SessionSlot = {};
  const transport = sessionTransport(slot);
  try {
    const response = await connectAndHandle(slot, transport, request, createServer);
    if (!slot.registeredSessionId) {
      await discardPendingSession(slot, transport);
    }
    return response;
  } catch (error) {
    await discardPendingSession(slot, transport);
    throw error;
  }
}

async function connectAndHandle(
  slot: SessionSlot,
  transport: WebStandardStreamableHTTPServerTransport,
  request: Request,
  createServer: () => McpServer,
) {
  const server = createServer();
  slot.session = { server, transport, lastActiveAt: Date.now() };
  await server.connect(transport);
  return transport.handleRequest(request);
}

function sessionTransport(slot: SessionSlot) {
  return new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    onsessioninitialized: (sessionId) => registerSession(slot, sessionId),
    onsessionclosed: (sessionId) => removeSession(sessionId),
    enableJsonResponse: true,
  });
}

async function registerSession(slot: SessionSlot, sessionId: string) {
  const session = slot.session;
  if (!session) return;
  session.lastActiveAt = Date.now();
  await evictUntilCapacity();
  sessions.set(sessionId, session);
  slot.registeredSessionId = sessionId;
}

async function evictUntilCapacity() {
  while (sessions.size >= maxConcurrentMcpSessions) {
    const sessionId = oldestSessionId();
    if (!sessionId) return;
    await removeSession(sessionId);
  }
}

function oldestSessionId() {
  let oldestId: string | undefined;
  let oldestActiveAt = Number.POSITIVE_INFINITY;
  for (const [sessionId, session] of sessions) {
    if (session.lastActiveAt < oldestActiveAt) {
      oldestId = sessionId;
      oldestActiveAt = session.lastActiveAt;
    }
  }
  return oldestId;
}

async function discardPendingSession(
  slot: SessionSlot,
  transport: WebStandardStreamableHTTPServerTransport,
) {
  const sessionId = slot.registeredSessionId;
  if (sessionId) {
    await removeSession(sessionId);
    return;
  }
  const session = slot.session;
  if (session) {
    await closeSession(session);
    return;
  }
  await closeQuietly(transport, "transport");
}
