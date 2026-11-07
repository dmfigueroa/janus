import { describe, expect, it, vi } from "vitest";
import { executeWriteBatch } from "@/app/mcp/ExecuteWriteBatch.server";

describe("write batch execution", () => {
  it("waits for each write before starting a dependent write", async () => {
    let release: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started: number[] = [];
    let state = 0;
    const result = executeWriteBatch([1, 2], async (value, index) => {
      started.push(value);
      if (index === 0) await pending;
      state += value;
      return { index, success: true, code: "updated", message: String(state) };
    });
    expect(started).toEqual([1]);
    release();
    expect(await result).toEqual([
      { index: 0, success: true, code: "updated", message: "1" },
      { index: 1, success: true, code: "updated", message: "3" },
    ]);
  });

  it("isolates synchronous exceptions and preserves expected failures", async () => {
    const logging = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const results = await executeWriteBatch([0, 1, 2], (value, index) => {
        if (value === 1) throw new Error("private");
        return { index, success: false, code: "not_found", message: "Missing" };
      });
      expect(results.map((result) => result.code)).toEqual([
        "not_found",
        "internal_error",
        "not_found",
      ]);
      expect(JSON.stringify(results)).not.toContain("private");
    } finally {
      logging.mockRestore();
    }
  });

  it("accepts an empty batch without executing writes", async () => {
    const operation = vi.fn();
    expect(await executeWriteBatch([], operation)).toEqual([]);
    expect(operation).not.toHaveBeenCalled();
  });
});
