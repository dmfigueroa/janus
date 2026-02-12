import { describe, it, expect, vi, beforeEach } from "vitest";
import { withCache } from "./cache";
import { cacheDb } from "@/db/cache";
import { sourceCache } from "@/db/cache/schema";

describe("withCache", () => {
  beforeEach(() => {
    // Clear the cache before each test to ensure isolation
    cacheDb.delete(sourceCache).run();
  });

  it("should fetch fresh data on cache miss", async () => {
    const fetcher = vi.fn().mockResolvedValue({ foo: "bar" });
    const result = await withCache("test-key", fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ foo: "bar" });
  });

  it("should return cached data on cache hit", async () => {
    const fetcher = vi.fn().mockResolvedValue({ foo: "bar" });

    // First call - miss
    await withCache("test-key", fetcher);

    // Second call - hit
    const result = await withCache("test-key", fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ foo: "bar" });
  });

  it("should fetch fresh data if cache is expired", async () => {
    const fetcher = vi.fn().mockResolvedValue({ foo: "bar" });

    // Initial fetch with a TTL that will make it expired immediately
    // Note: withCache adds ttlSeconds*1000 to Date.now()
    await withCache("test-key", fetcher, -100);

    const result = await withCache("test-key", fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ foo: "bar" });
  });

  it("should fetch fresh data if forceRefresh is true", async () => {
    const fetcher = vi.fn().mockResolvedValue({ foo: "bar" });

    // Initial fetch
    await withCache("test-key", fetcher);

    // Force refresh
    const result = await withCache("test-key", fetcher, 3600, true);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ foo: "bar" });
  });

  it("should handle JSON parsing errors gracefully", async () => {
    // Manually insert invalid JSON
    cacheDb
      .insert(sourceCache)
      .values({
        key: "invalid-json",
        value: "not-json",
        expiresAt: Date.now() + 100000,
      })
      .run();

    const fetcher = vi.fn().mockResolvedValue({ foo: "bar" });
    const result = await withCache("invalid-json", fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ foo: "bar" });
  });
});
