import { afterEach, describe, expect, it } from "vitest";
import {
  runWithServerLogContext,
  serializeError,
  serverLogger,
} from "@/shared/logging/ServerLog.server";
import { captureServerLogs, restoreServerLogs } from "@test/support/LogCapture";

afterEach(() => {
  restoreServerLogs();
});

describe("server logging", () => {
  it("keeps request correlation across asynchronous work", async () => {
    const records = captureServerLogs();

    await runWithServerLogContext(
      { requestId: "request-123", sessionId: "session-456", transport: "mcp" },
      async () => {
        await Promise.resolve();
        await Promise.resolve();
        serverLogger("error", "mcp.batch.operation_failed", {
          tool: "merge_watchlists",
          index: 1,
          operationCount: 3,
          outcome: "internal_error",
          durationMs: 12,
        });
      },
    );

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      service: "janus",
      requestId: "request-123",
      sessionId: "session-456",
      transport: "mcp",
      event: "mcp.batch.operation_failed",
      tool: "merge_watchlists",
      index: 1,
      operationCount: 3,
      outcome: "internal_error",
      durationMs: 12,
    });
  });

  it("redacts authorization headers and query-string credentials", () => {
    const records = captureServerLogs();

    serverLogger("error", "provider.request.failed", {
      request: {
        headers: { authorization: "Bearer provider-secret" },
        url: "https://api.example.test/items?api_key=query-secret&query=kept",
      },
      apiKey: "field-secret",
      error: new Error("failed https://api.example.test/items?key=message-secret&query=kept"),
      note: "Token token-secret",
    });

    const record = records[0]!;
    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain("provider-secret");
    expect(serialized).not.toContain("query-secret");
    expect(serialized).not.toContain("field-secret");
    expect(serialized).not.toContain("message-secret");
    expect(serialized).not.toContain("token-secret");
    expect(record.request).toMatchObject({
      headers: { authorization: "[REDACTED]" },
    });
    expect(JSON.stringify(record.request)).toContain("query=kept");
    expect(JSON.stringify(record.error)).toContain("query=kept");
  });

  it("serializes exception details and their causes with redaction", () => {
    const records = captureServerLogs();

    const error = new Error("outer https://api.example.test/items?token=outer-secret", {
      cause: new Error("inner Authorization: Basic inner-secret"),
    });
    serverLogger("error", "provider.operation.failed", {
      provider: "tmdb",
      operation: "get_movie_details",
      outcome: "unexpected_error",
      error: serializeError(error),
    });

    const serialized = JSON.stringify(records[0]);
    expect(serialized).not.toContain("outer-secret");
    expect(serialized).not.toContain("inner-secret");
    expect(records[0]!.error).toMatchObject({
      name: "Error",
      message: expect.stringContaining("[REDACTED]"),
      cause: {
        name: "Error",
        message: expect.stringContaining("[REDACTED]"),
      },
    });
    expect(records[0]!.error).toHaveProperty("stack");
  });
});
