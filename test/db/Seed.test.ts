import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asc } from "drizzle-orm";
import * as schema from "@/db/Schema";
import { seedInto } from "@/db/Seed";
import { createIsolatedTestDb } from "@test/IsolatedDb";

let testDb: Awaited<ReturnType<typeof createIsolatedTestDb>>;

beforeAll(async () => {
  testDb = await createIsolatedTestDb();
});

afterAll(() => testDb.close());

describe("demo seed", () => {
  it("initializes seeded watchlists with unpaused monotonic rotation positions", async () => {
    seedInto(testDb.sqlite);

    const seeded = await testDb.db
      .select()
      .from(schema.watchlists)
      .orderBy(asc(schema.watchlists.id));

    expect(seeded.length).toBeGreaterThan(0);
    for (const watchlist of seeded) {
      expect(watchlist.pausedAt).toBeNull();
      expect(watchlist.lastWatchedAt).toEqual(expect.any(String));
    }

    const timestamps = seeded.map((watchlist) => watchlist.lastWatchedAt!);
    expect(new Set(timestamps).size).toBe(timestamps.length);
    expect([...timestamps].sort()).toEqual(timestamps);
  });
});
