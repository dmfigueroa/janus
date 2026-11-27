import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleMcpSessionRequest } from "@/integrations/mcp/McpSessionTransport.server";

const sessionIdleDurationMs = 15 * 60 * 1000;
const maxConcurrentSessions = 64;
const internalError = {
  jsonrpc: "2.0",
  error: { code: -32603, message: "Internal error" },
  id: null,
};

const openSessionIds: string[] = [];

function createServer() {
  return new McpServer({ name: "janus-session-lifecycle", version: "1.0.0" });
}

function jsonRequest(
  sessionId: string | undefined,
  body: Record<string, unknown>,
  headers?: HeadersInit,
) {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("content-type", "application/json");
  requestHeaders.set("accept", "application/json, text/event-stream");
  if (sessionId) {
    requestHeaders.set("mcp-session-id", sessionId);
    requestHeaders.set("mcp-protocol-version", "2025-03-26");
  }
  return new Request("http://janus.test/mcp", {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify(body),
  });
}

function initializeRequest() {
  return jsonRequest(undefined, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "session-lifecycle", version: "1.0.0" },
    },
  });
}

async function initializeSession() {
  const response = await handleMcpSessionRequest(initializeRequest(), createServer);
  expect(response.status, await response.clone().text()).toBe(200);
  const sessionId = response.headers.get("mcp-session-id");
  if (!sessionId) {
    throw new Error("missing mcp-session-id");
  }
  openSessionIds.push(sessionId);
  return sessionId;
}

function pingRequest(sessionId: string) {
  return jsonRequest(sessionId, { jsonrpc: "2.0", id: 2, method: "ping" });
}

async function deleteSession(sessionId: string) {
  await handleMcpSessionRequest(
    new Request("http://janus.test/mcp", {
      method: "DELETE",
      headers: {
        "mcp-session-id": sessionId,
        "mcp-protocol-version": "2025-03-26",
      },
    }),
    createServer,
  );
}

afterEach(async () => {
  vi.restoreAllMocks();
  const sessionIds = openSessionIds.splice(0);
  for (const sessionId of sessionIds) {
    await deleteSession(sessionId);
  }
});

describe("MCP session lifecycle", () => {
  it("closes an idle session after 15 minutes", async () => {
    const closeTransport = vi.spyOn(WebStandardStreamableHTTPServerTransport.prototype, "close");
    const closeServer = vi.spyOn(McpServer.prototype, "close");
    const sessionId = await initializeSession();
    expect(closeTransport).not.toHaveBeenCalled();
    expect(closeServer).not.toHaveBeenCalled();

    const openedAt = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(openedAt + sessionIdleDurationMs + 1);
    const response = await handleMcpSessionRequest(pingRequest(sessionId), createServer);

    expect(closeTransport).toHaveBeenCalled();
    expect(closeServer).toHaveBeenCalled();
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("MCP session not found");
  });

  it("evicts the oldest idle session once 64 sessions are open", async () => {
    const sessionIds: string[] = [];
    for (let index = 0; index < maxConcurrentSessions; index += 1) {
      sessionIds.push(await initializeSession());
    }
    const oldest = sessionIds[0];
    const nextOldest = sessionIds[1];
    expect((await handleMcpSessionRequest(pingRequest(oldest), createServer)).status).toBe(200);

    const closeTransport = vi.spyOn(WebStandardStreamableHTTPServerTransport.prototype, "close");
    const newest = await initializeSession();

    expect(closeTransport).toHaveBeenCalled();
    const evicted = await handleMcpSessionRequest(pingRequest(nextOldest), createServer);
    expect(evicted.status).toBe(404);
    expect(await evicted.text()).toBe("MCP session not found");
    expect((await handleMcpSessionRequest(pingRequest(oldest), createServer)).status).toBe(200);
    expect((await handleMcpSessionRequest(pingRequest(newest), createServer)).status).toBe(200);
  }, 30_000);

  it("keeps at most 64 sessions under concurrent initialization", async () => {
    const sessionIds = await Promise.all(
      Array.from({ length: maxConcurrentSessions + 16 }, () => initializeSession()),
    );
    let liveCount = 0;
    for (const sessionId of sessionIds) {
      const response = await handleMcpSessionRequest(pingRequest(sessionId), createServer);
      if (response.status === 200) {
        liveCount += 1;
      }
    }
    expect(liveCount).toBe(maxConcurrentSessions);
  }, 60_000);

  it("returns JSON-RPC internal error when an established session request throws", async () => {
    const sessionId = await initializeSession();
    const original = WebStandardStreamableHTTPServerTransport.prototype.handleRequest;
    vi.spyOn(
      WebStandardStreamableHTTPServerTransport.prototype,
      "handleRequest",
    ).mockImplementation(
      function (this: WebStandardStreamableHTTPServerTransport, request, options) {
        if (request.headers.get("x-fail-session") === "1") {
          return Promise.reject(new Error("forced session failure"));
        }
        return original.call(this, request, options);
      },
    );

    const response = await handleMcpSessionRequest(
      jsonRequest(sessionId, { jsonrpc: "2.0", id: 3, method: "ping" }, { "x-fail-session": "1" }),
      createServer,
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = await response.json();
    expect(body).toEqual(internalError);
    expect(JSON.stringify(body)).not.toContain("forced session failure");
  });

  it("closes a transport that never registers a session", async () => {
    const closeTransport = vi.spyOn(WebStandardStreamableHTTPServerTransport.prototype, "close");
    const closeServer = vi.spyOn(McpServer.prototype, "close");
    const response = await handleMcpSessionRequest(
      jsonRequest(undefined, { jsonrpc: "2.0", id: 1, method: "ping" }),
      createServer,
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(closeTransport).toHaveBeenCalled();
    expect(closeServer).toHaveBeenCalled();
  });

  it("closes the transport and returns JSON-RPC internal error when server construction fails", async () => {
    const closeTransport = vi.spyOn(WebStandardStreamableHTTPServerTransport.prototype, "close");
    const response = await handleMcpSessionRequest(initializeRequest(), () => {
      throw new Error("server construction failed");
    });

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = await response.json();
    expect(body).toEqual(internalError);
    expect(JSON.stringify(body)).not.toContain("server construction failed");
    expect(closeTransport).toHaveBeenCalled();
  });

  it("closes the server and transport when connect fails", async () => {
    const closeTransport = vi.spyOn(WebStandardStreamableHTTPServerTransport.prototype, "close");
    const closeServer = vi.spyOn(McpServer.prototype, "close");
    const response = await handleMcpSessionRequest(initializeRequest(), () => {
      const server = createServer();
      vi.spyOn(server, "connect").mockRejectedValue(new Error("connect failed"));
      return server;
    });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual(internalError);
    expect(JSON.stringify(body)).not.toContain("connect failed");
    expect(closeTransport).toHaveBeenCalled();
    expect(closeServer).toHaveBeenCalled();
  });
});
