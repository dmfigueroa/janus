import { eq } from "drizzle-orm";
import { cacheDb } from "@/db/cache";
import { sourceCache } from "@/db/cache/schema";

export const DEFAULT_TTL = 60 * 60 * 24; // 24 hours in seconds

export async function withCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number = DEFAULT_TTL,
  forceRefresh: boolean = false,
): Promise<T> {
  if (!forceRefresh) {
    const cached = cacheDb.select().from(sourceCache).where(eq(sourceCache.key, key)).get();

    if (cached && cached.expiresAt > Date.now()) {
      try {
        return JSON.parse(cached.value) as T;
      } catch (e) {
        console.error(`Failed to parse cache for key ${key}`, e);
      }
    }
  }

  const fresh = await fetcher();

  cacheDb
    .insert(sourceCache)
    .values({
      key,
      value: JSON.stringify(fresh),
      expiresAt: Date.now() + ttlSeconds * 1000,
    })
    .onConflictDoUpdate({
      target: sourceCache.key,
      set: {
        value: JSON.stringify(fresh),
        expiresAt: Date.now() + ttlSeconds * 1000,
      },
    })
    .run();

  return fresh;
}
