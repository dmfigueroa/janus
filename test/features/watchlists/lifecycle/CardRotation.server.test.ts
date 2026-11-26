import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { watchlists, watchlistItems } from "@/db/Schema";
import { createIsolatedTestDb, type IsolatedTestDb } from "@test/IsolatedDb";
import { createTestWatchlistItem } from "@test/features/watchlists/test/WatchlistTestData.server";

const state = vi.hoisted(() => ({ db: undefined as IsolatedTestDb | undefined }));
vi.mock("@/db/Db.server", () => ({ getDb: () => state.db }));
let database: Awaited<ReturnType<typeof createIsolatedTestDb>>;
beforeAll(async () => {
  database = await createIsolatedTestDb();
  state.db = database.db;
});
afterAll(() => database.close());

it("marks the displayed next item and restores both watched state and rotation on undo", async () => {
  const { createWatchlist } = await import("@/features/watchlists/Repository.server");
  const { applyCardRotation, undoCardRotation } =
    await import("@/features/watchlists/rotation/CardRotation.server");
  const watchlist = await createWatchlist({ name: "Card action" });
  const item = await createTestWatchlistItem(database.db, { watchlistId: watchlist.id });
  const result = applyCardRotation({
    watchlistId: watchlist.id,
    itemId: item.id,
    action: "watched",
  });
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(result.message);
  expect(
    database.db.select().from(watchlistItems).where(eq(watchlistItems.id, item.id)).get()
      ?.isWatched,
  ).toBe(true);
  expect(undoCardRotation(result.receipt)).toEqual({ success: true });
  expect(
    database.db.select().from(watchlistItems).where(eq(watchlistItems.id, item.id)).get()
      ?.isWatched,
  ).toBe(false);
  expect(
    database.db.select().from(watchlists).where(eq(watchlists.id, watchlist.id)).get()
      ?.lastWatchedAt,
  ).toBe(watchlist.lastWatchedAt);
  expect(undoCardRotation(result.receipt).success).toBe(false);
});

it("skip leaves items unchanged, rejects stale actions, and never undoes a newer rotation", async () => {
  const { createWatchlist } = await import("@/features/watchlists/Repository.server");
  const { applyCardRotation, undoCardRotation } =
    await import("@/features/watchlists/rotation/CardRotation.server");
  const watchlist = await createWatchlist({ name: "Skip card" });
  const item = await createTestWatchlistItem(database.db, { watchlistId: watchlist.id });
  expect(
    applyCardRotation({ watchlistId: watchlist.id, itemId: item.id + 1000, action: "watched" })
      .success,
  ).toBe(false);
  const result = applyCardRotation({ watchlistId: watchlist.id, itemId: item.id, action: "skip" });
  if (!result.success) throw new Error(result.message);
  expect(
    database.db.select().from(watchlistItems).where(eq(watchlistItems.id, item.id)).get()
      ?.isWatched,
  ).toBe(false);
  expect(undoCardRotation(result.receipt).success).toBe(true);
  const second = applyCardRotation({ watchlistId: watchlist.id, itemId: item.id, action: "skip" });
  if (!second.success) throw new Error(second.message);
  applyCardRotation({ watchlistId: watchlist.id, itemId: item.id, action: "watched" });
  expect(undoCardRotation(second.receipt).success).toBe(false);
});
