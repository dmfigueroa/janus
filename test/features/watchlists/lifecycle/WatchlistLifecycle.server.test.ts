import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { watchlists, watchlistItems } from "@/db/Schema";
import { createIsolatedTestDb, type IsolatedTestDb } from "@test/IsolatedDb";
import { createTestWatchlistItem } from "@test/features/watchlists/test/WatchlistTestData.server";
import { buildWatchlistHome } from "@/features/watchlists/home/WatchlistHome";

const state = vi.hoisted(() => ({ db: undefined as IsolatedTestDb | undefined }));
vi.mock("@/db/Db.server", () => ({ getDb: () => state.db }));
let testDb: Awaited<ReturnType<typeof createIsolatedTestDb>>;

beforeAll(async () => {
  testDb = await createIsolatedTestDb();
  state.db = testDb.db;
});
afterAll(() => testDb.close());

describe("persisted watchlist lifecycle", () => {
  it("moves each watch or skip to the back even when actions share a clock tick", async () => {
    const { createWatchlist } = await import("@/features/watchlists/Repository.server");
    const { skipWatchlistMutation, setWatchedStateMutation } =
      await import("@/features/watchlists/lifecycle/WatchlistLifecycle.server");
    const { listWatchlistSummaries } = await import("@/features/watchlists/list/Query.server");
    const first = await createWatchlist({ name: "First" });
    const second = await createWatchlist({ name: "Second" });
    const ids = [first.id, second.id];
    const rotation = async () =>
      (await listWatchlistSummaries({ orderBy: "recency" }))
        .filter(({ id }) => ids.includes(id))
        .map(({ id }) => id);
    expect(await rotation()).toEqual([first.id, second.id]);
    await skipWatchlistMutation({ watchlistId: first.id });
    expect(await rotation()).toEqual([second.id, first.id]);
    await skipWatchlistMutation({ watchlistId: second.id });
    expect(await rotation()).toEqual([first.id, second.id]);
    const item = await createTestWatchlistItem(testDb.db, { watchlistId: first.id });
    await setWatchedStateMutation({ itemId: item.id, isWatched: true });
    expect(await rotation()).toEqual([second.id, first.id]);
    await skipWatchlistMutation({ watchlistId: second.id });
    await setWatchedStateMutation({ itemId: item.id, isWatched: true });
    expect(await rotation()).toEqual([first.id, second.id]);
  });

  it("keeps home and Watch Now consistent through pause, completion, reopening and emptying", async () => {
    const { createWatchlist } = await import("@/features/watchlists/Repository.server");
    const { pauseWatchlistMutation, resumeWatchlistMutation, setWatchedStateMutation } =
      await import("@/features/watchlists/lifecycle/WatchlistLifecycle.server");
    const { listWatchlistSummaries } = await import("@/features/watchlists/list/Query.server");
    const { readLineups } = await import("@/features/lineups/read/LineupRead.server");
    const watchlist = await createWatchlist({ name: "Lifecycle" });
    const read = async () => ({
      home: buildWatchlistHome(await listWatchlistSummaries()),
      lineups: await readLineups(),
    });
    const expectState = async (
      section: "empty" | "rotation" | "completed" | "paused",
      eligible: boolean,
    ) => {
      const { home, lineups } = await read();
      expect(home[section].map(({ id }) => id)).toContain(watchlist.id);
      expect(
        lineups.some((lineup) => lineup.eligibleWatchlists.some(({ id }) => id === watchlist.id)),
      ).toBe(eligible);
    };
    await expectState("empty", false);
    const item = await createTestWatchlistItem(testDb.db, { watchlistId: watchlist.id });
    await expectState("rotation", true);
    await pauseWatchlistMutation({ watchlistId: watchlist.id });
    const paused = testDb.db.select().from(watchlists).where(eq(watchlists.id, watchlist.id)).get();
    await expectState("paused", false);
    await setWatchedStateMutation({
      itemId: item.id,
      isWatched: true,
      updateWatchlistRecency: false,
    });
    await expectState("completed", false);
    await setWatchedStateMutation({ itemId: item.id, isWatched: false });
    await expectState("paused", false);
    await setWatchedStateMutation({
      itemId: item.id,
      isWatched: true,
      updateWatchlistRecency: false,
    });
    const added = await createTestWatchlistItem(testDb.db, {
      watchlistId: watchlist.id,
      tmdbId: "added",
    });
    await expectState("paused", false);
    expect(
      testDb.db.select().from(watchlists).where(eq(watchlists.id, watchlist.id)).get(),
    ).toMatchObject({ pausedAt: paused?.pausedAt, lastWatchedAt: watchlist.lastWatchedAt });
    await resumeWatchlistMutation({ watchlistId: watchlist.id });
    await resumeWatchlistMutation({ watchlistId: watchlist.id });
    await expectState("rotation", true);
    await testDb.db.delete(watchlistItems).where(eq(watchlistItems.id, added.id));
    await expectState("completed", false);
    await testDb.db.delete(watchlistItems).where(eq(watchlistItems.watchlistId, watchlist.id));
    await expectState("empty", false);
  });

  it("preserves the original pause start across retries", async () => {
    const { createWatchlist } = await import("@/features/watchlists/Repository.server");
    const { pauseWatchlistMutation } =
      await import("@/features/watchlists/lifecycle/WatchlistLifecycle.server");
    const watchlist = await createWatchlist({ name: "Pause retry" });
    await testDb.db
      .update(watchlists)
      .set({ pausedAt: "2000-01-01 00:00:00" })
      .where(eq(watchlists.id, watchlist.id));
    await pauseWatchlistMutation({ watchlistId: watchlist.id });
    expect(
      testDb.db.select().from(watchlists).where(eq(watchlists.id, watchlist.id)).get(),
    ).toMatchObject({ pausedAt: "2000-01-01 00:00:00", lastWatchedAt: watchlist.lastWatchedAt });
  });
});
