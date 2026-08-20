import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/Schema";
import { createIsolatedTestDb, type IsolatedTestDb } from "@test/IsolatedDb";

const dbState = vi.hoisted(() => ({ db: undefined as IsolatedTestDb | undefined }));
vi.mock("@/db/Db.server", () => ({ getDb: () => dbState.db }));

let testDb: Awaited<ReturnType<typeof createIsolatedTestDb>>;
let db: IsolatedTestDb;
let editWatchlistItemMutation: typeof import("@/features/watchlists/edit/Mutation.server").editWatchlistItemMutation;

beforeAll(async () => {
  testDb = await createIsolatedTestDb();
  db = testDb.db;
  dbState.db = db;
  ({ editWatchlistItemMutation } = await import("@/features/watchlists/edit/Mutation.server"));
});

afterAll(() => testDb.close());
beforeEach(async () => {
  await db.delete(schema.watchlistItems);
  await db.delete(schema.watchlists);
});

describe("edit watchlist item mutation", () => {
  it("replaces the title and release date without changing custom order", async () => {
    const [watchlist] = await db
      .insert(schema.watchlists)
      .values({ name: "Queue", itemOrderMode: "custom" })
      .returning();
    const [item] = await db
      .insert(schema.watchlistItems)
      .values({
        watchlistId: watchlist.id,
        tmdbId: "movie-1",
        mediaType: "movie",
        title: "Old title",
        releaseDate: "2024-01-01",
        customRank: 7,
      })
      .returning();

    const result = await editWatchlistItemMutation({
      watchlistId: watchlist.id,
      itemId: item.id,
      title: " New title ",
      releaseDate: "2025-02-03",
    });

    expect(result).toEqual({ success: true });
    const [updated] = await db
      .select()
      .from(schema.watchlistItems)
      .where(eq(schema.watchlistItems.id, item.id));
    expect(updated).toMatchObject({
      title: "New title",
      releaseDate: "2025-02-03",
      customRank: 7,
    });
  });

  it("clears a release date", async () => {
    const [watchlist] = await db.insert(schema.watchlists).values({ name: "Queue" }).returning();
    const [item] = await db
      .insert(schema.watchlistItems)
      .values({ watchlistId: watchlist.id, tmdbId: "movie-1", mediaType: "movie", title: "Movie" })
      .returning();

    const result = await editWatchlistItemMutation({
      watchlistId: watchlist.id,
      itemId: item.id,
      title: "Movie",
      releaseDate: null,
    });

    expect(result).toEqual({ success: true });
  });
});
