import type { RpcPayload } from "./V2ServerProcess";

export type V1McpHandler = (request: Request) => Promise<Response>;

export interface V1McpSession {
  sessionId: string;
  rpc(method: string, params?: Record<string, unknown>): Promise<RpcPayload>;
  close(): Promise<void>;
}

export async function startV1McpSession(handler: V1McpHandler): Promise<V1McpSession> {
  const initResponse = await sendV1Request(handler, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "v1-compliance", version: "1.0.0" },
    },
  });
  const sessionId = initResponse.headers.get("mcp-session-id");
  if (!sessionId) {
    throw new Error(`Missing v1 mcp-session-id: ${await initResponse.text()}`);
  }
  await sendV1Request(handler, { jsonrpc: "2.0", method: "notifications/initialized" }, sessionId);
  return createV1SessionHandle(handler, sessionId);
}

function createV1SessionHandle(handler: V1McpHandler, sessionId: string): V1McpSession {
  let nextId = 2;
  return {
    sessionId,
    async rpc(method, params) {
      const id = nextId;
      nextId += 1;
      const response = await sendV1Request(
        handler,
        { jsonrpc: "2.0", id, method, params },
        sessionId,
      );
      return (await response.json()) as RpcPayload;
    },
    async close() {
      await handler(
        new Request("http://janus.test/mcp", {
          method: "DELETE",
          headers: { "mcp-session-id": sessionId },
        }),
      );
    },
  };
}

function sendV1Request(
  handler: V1McpHandler,
  body: Record<string, unknown>,
  sessionId?: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (sessionId) {
    headers["mcp-session-id"] = sessionId;
  }
  return handler(
    new Request("http://janus.test/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}
