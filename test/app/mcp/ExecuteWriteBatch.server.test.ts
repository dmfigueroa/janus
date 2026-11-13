import { afterEach, describe, expect, it, vi } from "vitest";
import { executeWriteBatch } from "@/app/mcp/ExecuteWriteBatch.server";
import { runWithServerLogContext } from "@/shared/logging/ServerLog.server";
import { captureServerLogs, restoreServerLogs } from "@test/support/LogCapture";

afterEach(() => {
  restoreServerLogs();
});

describe("write batch execution", () => {
  it("waits for each write before starting a dependent write", async () => {
    let release: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started: number[] = [];
    let state = 0;
    const result = executeWriteBatch(
      [1, 2],
      async (value, index) => {
        started.push(value);
        if (index === 0) await pending;
        state += value;
        return { index, success: true, code: "updated", message: String(state) };
      },
      "update_watchlists",
    );
    expect(started).toEqual([1]);
    release();
    expect(await result).toEqual([
      { index: 0, success: true, code: "updated", message: "1" },
      { index: 1, success: true, code: "updated", message: "3" },
    ]);
  });

  it("isolates synchronous exceptions with correlated structured logs", async () => {
    const records = captureServerLogs();

    const results = await runWithServerLogContext({ requestId: "batch-request" }, () =>
      executeWriteBatch(
        [0, 1, 2],
        (value, index) => {
          if (value === 1) throw new Error("private");
          return { index, success: false, code: "not_found", message: "Missing" };
        },
        "remove_watchlist_items",
      ),
    );

    expect(results.map((result) => result.code)).toEqual([
      "not_found",
      "internal_error",
      "not_found",
    ]);
    expect(JSON.stringify(results)).not.toContain("private");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      requestId: "batch-request",
      event: "mcp.batch.operation_failed",
      tool: "remove_watchlist_items",
      index: 1,
      operationCount: 3,
      outcome: "internal_error",
      error: { name: "Error", message: "private" },
    });
  });

  it("accepts an empty batch without executing writes", async () => {
    const operation = vi.fn();
    expect(await executeWriteBatch([], operation, "update_watchlists")).toEqual([]);
    expect(operation).not.toHaveBeenCalled();
  });
});
