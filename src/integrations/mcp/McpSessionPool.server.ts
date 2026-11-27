import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { serializeError, serverLogger } from "@/shared/logging/ServerLog.server";

export type McpSession = {
  server: McpServer;
  transport: WebStandardStreamableHTTPServerTransport;
  lastActiveAt: number;
};

type Closeable = { close: () => Promise<void> };

export const sessionIdleDurationMs = 15 * 60 * 1000;
export const maxConcurrentMcpSessions = 64;

const sessions = new Map<string, McpSession>();
let sessionMutationChain: Promise<void> = Promise.resolve();

function runExclusiveSessionMutation<T>(operation: () => T | Promise<T>): Promise<T> {
  const result = sessionMutationChain.then(operation, operation);
  sessionMutationChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export function getSession(sessionId: string) {
  return sessions.get(sessionId);
}

export async function removeExpiredSessions() {
  const expirationTime = Date.now() - sessionIdleDurationMs;
  for (const sessionId of expiredSessionIds(expirationTime)) {
    await removeSession(sessionId);
  }
}

function expiredSessionIds(expirationTime: number) {
  return [...sessions]
    .filter(([, session]) => session.lastActiveAt < expirationTime)
    .map(([sessionId]) => sessionId);
}

export async function removeSession(sessionId: string) {
  const session = await runExclusiveSessionMutation(() => takeSession(sessionId));
  if (session) await closeSession(session);
}

function takeSession(sessionId: string) {
  const found = sessions.get(sessionId);
  if (!found) return undefined;
  sessions.delete(sessionId);
  return found;
}

export async function registerSession(
  session: McpSession,
  sessionId: string,
  onRegistered: (sessionId: string) => void,
) {
  session.lastActiveAt = Date.now();
  const victims = await runExclusiveSessionMutation(() => {
    const toClose = takeOldestSessionsUntilCapacity();
    sessions.set(sessionId, session);
    onRegistered(sessionId);
    return toClose;
  });
  await Promise.all(victims.map((victim) => closeSession(victim)));
}

function takeOldestSessionsUntilCapacity() {
  const victims: McpSession[] = [];
  while (sessions.size >= maxConcurrentMcpSessions) {
    const victim = takeOldestSession();
    if (!victim) return victims;
    victims.push(victim);
  }
  return victims;
}

function takeOldestSession() {
  const victimId = oldestSessionId();
  return victimId ? takeSession(victimId) : undefined;
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

export function closeSession(session: McpSession) {
  return Promise.all([
    closeQuietly(session.transport, "transport"),
    closeQuietly(session.server, "server"),
  ]);
}

export function closeQuietly(resource: Closeable, component: string) {
  return resource.close().catch((error: unknown) => {
    serverLogger("error", "mcp.session.close_failed", {
      outcome: "internal_error",
      component,
      error: serializeError(error),
    });
  });
}
