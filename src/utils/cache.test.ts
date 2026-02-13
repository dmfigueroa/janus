import { describe, it, expect, beforeEach, vi } from "vitest";
import { CacheService } from "./cache";
import { z } from "zod";
import { cacheDb } from "@/db/cache";
import { apiCache } from "@/db/cache-schema";
import { eq } from "drizzle-orm";

describe("CacheService", () => {
  const testKey = "test-key";
  const testProvider = "test-provider";
  const testData = { foo: "bar" };
  const testSchema = z.object({ foo: z.string() });

  beforeEach(async () => {
    // Clean up test data
    await cacheDb.delete(apiCache).where(eq(apiCache.key, testKey));
  });

  it("should set and get values from cache", async () => {
    await CacheService.set(testKey, testProvider, testData);
    const result = await CacheService.get(testKey, testSchema);
    expect(result).toEqual(testData);
  });

  it("should return null for expired values", async () => {
    // Set with negative TTL (expired)
    await CacheService.set(testKey, testProvider, testData, -100);
    const result = await CacheService.get(testKey, testSchema);
    expect(result).toBeNull();
  });

  it("should return null for non-existent keys", async () => {
    const result = await CacheService.get("non-existent", testSchema);
    expect(result).toBeNull();
  });

  it("should invalidate cache if schema doesn't match", async () => {
    await CacheService.set(testKey, testProvider, testData);
    const wrongSchema = z.object({ baz: z.number() });
    const result = await CacheService.get(testKey, wrongSchema);
    expect(result).toBeNull();
  });

  it("should use withCache to fetch and store data", async () => {
    const fetchFn = vi.fn().mockResolvedValue(testData);

    // First call: should fetch from source
    const result1 = await CacheService.withCache(testKey, testProvider, fetchFn, testSchema);
    expect(result1).toEqual(testData);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Second call: should return from cache
    const result2 = await CacheService.withCache(testKey, testProvider, fetchFn, testSchema);
    expect(result2).toEqual(testData);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("should force refresh when requested", async () => {
    const fetchFn = vi.fn().mockResolvedValue(testData);

    await CacheService.set(testKey, testProvider, { old: "data" });

    const result = await CacheService.withCache(testKey, testProvider, fetchFn, testSchema, { forceRefresh: true });
    expect(result).toEqual(testData);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
