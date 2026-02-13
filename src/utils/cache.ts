import { cacheDb } from "@/db/cache";
import { apiCache } from "@/db/cache-schema";
import { eq, and, gt } from "drizzle-orm";
import { z } from "zod";

const DEFAULT_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

export class CacheService {
  /**
   * Get a value from the cache
   */
  static async get<T>(key: string, schema: z.ZodSchema<T>): Promise<T | null> {
    try {
      const now = new Date().toISOString();
      const result = await cacheDb
        .select()
        .from(apiCache)
        .where(and(eq(apiCache.key, key), gt(apiCache.expiresAt, now)))
        .get();

      if (!result) return null;

      const parsed = schema.safeParse(result.data);
      if (!parsed.success) {
        console.warn(`Cache invalidation for key ${key} due to schema mismatch`);
        return null;
      }

      return parsed.data;
    } catch (error) {
      console.error(`Error reading from cache for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set a value in the cache
   */
  static async set(
    key: string,
    provider: string,
    data: any,
    ttlSeconds: number = DEFAULT_TTL,
  ): Promise<void> {
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

      await cacheDb
        .insert(apiCache)
        .values({
          key,
          provider,
          data,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: apiCache.key,
          set: {
            data,
            provider,
            expiresAt,
            createdAt: new Date().toISOString(),
          },
        });
    } catch (error) {
      console.error(`Error writing to cache for key ${key}:`, error);
    }
  }

  /**
   * Wrap an async function with caching logic
   */
  static async withCache<T>(
    key: string,
    provider: string,
    fetchFn: () => Promise<T>,
    schema: z.ZodSchema<T>,
    options: { ttl?: number; forceRefresh?: boolean } = {},
  ): Promise<T> {
    const { ttl = DEFAULT_TTL, forceRefresh = false } = options;

    if (!forceRefresh) {
      const cached = await this.get(key, schema);
      if (cached) return cached;
    }

    const freshData = await fetchFn();
    await this.set(key, provider, freshData, ttl);
    return freshData;
  }
}
