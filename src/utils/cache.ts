import { db } from "@/db";
import { apiCache } from "@/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { z } from "zod";
import { consola } from "consola";

const DEFAULT_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

export class CacheService {
  /**
   * Get a value from the cache
   */
  static async get<T>(key: string, schema: z.ZodSchema<T>): Promise<T | null> {
    try {
      const now = new Date().toISOString();
      const result = await db
        .select()
        .from(apiCache)
        .where(and(eq(apiCache.key, key), gt(apiCache.expiresAt, now)))
        .get();

      if (!result) {
        consola.info(`[Cache] MISS: ${key}`);
        return null;
      }

      const parsed = schema.safeParse(result.data);
      if (!parsed.success) {
        consola.warn(`[Cache] INVALIDATION: ${key} due to schema mismatch`);
        return null;
      }

      consola.success(`[Cache] HIT: ${key}`);
      return parsed.data;
    } catch (error) {
      consola.error(`[Cache] ERROR reading ${key}:`, error);
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

      consola.info(`[Cache] SET: ${key} (Provider: ${provider}, TTL: ${ttlSeconds}s)`);

      await db
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
      consola.error(`[Cache] ERROR writing ${key}:`, error);
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
