import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createIsolatedTestDb, type IsolatedTestDb } from "@test/IsolatedDb";
import { eq } from "drizzle-orm";
import { watchlists } from "@/db/Schema";
import {
  createTestWatchlist,
  createTestWatchlistItem,
} from "@test/features/watchlists/test/WatchlistTestData.server";

const state = vi.hoisted(() => ({ db: undefined as IsolatedTestDb | undefined }));
vi.mock("@/db/Db.server", () => ({ getDb: () => state.db }));
let testDb: Awaited<ReturnType<typeof createIsolatedTestDb>>;
let listLineups: typeof import("@/features/lineups/read/LineupConfigurationRead.server").listLineups;
let createLineup: typeof import("@/features/lineups/manage/LineupConfiguration.server").createLineup;
let readLineups: typeof import("@/features/lineups/read/LineupRead.server").readLineups;
let setLineupWatchlists: typeof import("@/features/lineups/manage/LineupConfiguration.server").setLineupWatchlists;
let reorderLineups: typeof import("@/features/lineups/manage/ReorderLineups.server").reorderLineups;
let updateLineup: typeof import("@/features/lineups/manage/LineupConfiguration.server").updateLineup;
let deleteLineup: typeof import("@/features/lineups/manage/DeleteLineup.server").deleteLineup;

beforeAll(async () => {
  testDb = await createIsolatedTestDb();
  state.db = testDb.db;
  ({ deleteLineup } = await import("@/features/lineups/manage/DeleteLineup.server"));
  ({ listLineups } = await import("@/features/lineups/read/LineupConfigurationRead.server"));
  ({ readLineups } = await import("@/features/lineups/read/LineupRead.server"));
  ({ reorderLineups } = await import("@/features/lineups/manage/ReorderLineups.server"));
  ({ createLineup, setLineupWatchlists, updateLineup } =
    await import("@/features/lineups/manage/LineupConfiguration.server"));
});
afterAll(() => testDb.close());

describe("lineups", () => {
  it("starts with the five enabled automatic lineups in their existing order", async () => {
    const initial = await listLineups();
    expect(await listLineups()).toEqual(initial);
    expect((await listLineups()).map(({ reference, enabled }) => ({ reference, enabled }))).toEqual(
      [
        { reference: { kind: "system", key: "movie" }, enabled: true },
        { reference: { kind: "system", key: "television" }, enabled: true },
        { reference: { kind: "system", key: "game" }, enabled: true },
        { reference: { kind: "system", key: "book" }, enabled: true },
        { reference: { kind: "system", key: "comic" }, enabled: true },
      ],
    );
  });

  it("creates trimmed custom names at the end and rejects duplicate and reserved names", async () => {
    expect(await createLineup("  Weeknights  ")).toMatchObject({ success: true });
    expect(await createLineup("WEEKNIGHTS")).toMatchObject({
      success: false,
      field: "name",
      message: "That lineup name is already used.",
    });
    expect(await createLineup("movies")).toMatchObject({
      success: false,
      field: "name",
      message: "Movies is reserved for an automatic lineup.",
    });
    expect((await listLineups()).at(-1)).toMatchObject({ name: "Weeknights", enabled: true });
  });

  it("preserves configured members while eligibility changes and validates complete order", async () => {
    const active = await createTestWatchlist(testDb.db, { name: "Active" });
    const paused = await createTestWatchlist(testDb.db, { name: "Paused", pausedAt: "2024-01-01" });
    await createTestWatchlistItem(testDb.db, {
      watchlistId: active.id,
      tmdbId: "1",
      source: "tmdb",
      mediaType: "movie",
      title: "Film",
    });
    await createTestWatchlistItem(testDb.db, {
      watchlistId: paused.id,
      tmdbId: "2",
      source: "tmdb",
      mediaType: "game",
      title: "Game",
    });
    const created = await createLineup("Friends");
    if (!created.success) throw new Error(created.message);
    const reference = { kind: "custom" as const, id: created.id };
    expect(await setLineupWatchlists(reference, [active.id, paused.id])).toMatchObject({
      success: true,
    });
    const lineup = (await readLineups()).find((entry) => entry.id === created.id)!;
    expect(lineup.configuredWatchlists?.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([active.id, paused.id]),
    );
    expect(lineup.eligibleWatchlists.map((entry) => entry.id)).toEqual([active.id]);
    expect(await setLineupWatchlists({ kind: "system", key: "movie" }, [active.id])).toMatchObject({
      success: false,
    });
    expect(await updateLineup({ kind: "system", key: "movie" }, { name: "Film" })).toMatchObject({
      success: false,
    });
    const order = (await listLineups()).map((entry) => entry.reference);
    expect(await reorderLineups(order.slice(1))).toMatchObject({ success: false });
    expect(await reorderLineups([...order].reverse())).toMatchObject({ success: true });
    expect((await listLineups()).map((entry) => entry.reference)).toEqual([...order].reverse());
    expect(await updateLineup(reference, { enabled: false })).toMatchObject({ success: true });
    expect((await readLineups()).find((entry) => entry.id === created.id)).toMatchObject({
      enabled: false,
      configuredCount: 2,
    });
    expect(await updateLineup(reference, { enabled: true })).toMatchObject({ success: true });
    expect((await listLineups()).map((entry) => entry.reference)).toEqual([...order].reverse());
    expect(await deleteLineup(reference)).toMatchObject({ success: true });
    expect((await readLineups()).find((entry) => entry.id === created.id)).toBeUndefined();
  });

  it("retains empty and completed watchlists as configured members", async () => {
    const { saveCustomLineup } =
      await import("@/features/lineups/manage/LineupConfiguration.server");
    const empty = await createTestWatchlist(testDb.db, { name: "Empty configured" });
    const completed = await createTestWatchlist(testDb.db, { name: "Completed configured" });
    await createTestWatchlistItem(testDb.db, { watchlistId: completed.id, isWatched: true });
    const created = await saveCustomLineup({
      name: "Hidden configured",
      watchlistIds: [empty.id, completed.id],
    });
    if (!created.success) throw new Error(created.message);
    expect((await readLineups()).find((entry) => entry.id === created.id)).toMatchObject({
      configuredCount: 2,
      eligibleCount: 0,
    });
  });

  it("rejects invalid edits atomically through UI and MCP operations", async () => {
    const { saveCustomLineup } =
      await import("@/features/lineups/manage/LineupConfiguration.server");
    const member = await createTestWatchlist(testDb.db, { name: "Atomic member" });
    const created = await saveCustomLineup({ name: "Atomic original", watchlistIds: [member.id] });
    if (!created.success) throw new Error(created.message);
    const reference = { kind: "custom" as const, id: created.id };
    for (const watchlistIds of [[member.id, member.id], [2147483647]]) {
      expect(
        await saveCustomLineup({ id: created.id, name: "Atomic changed", watchlistIds }),
      ).toMatchObject({ success: false, message: "One or more watchlists no longer exist." });
      expect(await setLineupWatchlists(reference, watchlistIds)).toEqual({
        success: false,
        code: "validation_error",
        message: "Watchlist IDs must be distinct and exist.",
      });
      const stored = (await readLineups()).find((entry) => entry.id === created.id)!;
      expect(stored.name).toBe("Atomic original");
      expect(stored.configuredWatchlists?.map((entry) => entry.id)).toEqual([member.id]);
    }
    for (const name of [" Movies ", "WEEKNIGHTS", "   "]) {
      expect(await saveCustomLineup({ id: created.id, name, watchlistIds: [] })).toMatchObject({
        success: false,
        field: "name",
      });
      expect(await updateLineup(reference, { name, enabled: false })).toEqual({
        success: false,
        code: "validation_error",
        message: "A unique lineup name is required.",
      });
    }
    expect((await readLineups()).find((entry) => entry.id === created.id)).toMatchObject({
      name: "Atomic original",
      enabled: true,
      configuredCount: 1,
    });
  });

  it("keeps overlapping memberships and removes only memberships when a watchlist is deleted", async () => {
    const list = await createTestWatchlist(testDb.db, { name: "Overlap" });
    const first = await createLineup("Overlap first");
    const second = await createLineup("Overlap second");
    if (!first.success || !second.success) throw new Error("Failed to create lineups");
    await setLineupWatchlists({ kind: "custom", id: first.id }, [list.id]);
    await setLineupWatchlists({ kind: "custom", id: second.id }, [list.id]);
    expect(
      (await readLineups())
        .filter((entry) => [first.id, second.id].includes(entry.id))
        .map((entry) => entry.configuredCount),
    ).toEqual([1, 1]);
    await testDb.db.delete(watchlists).where(eq(watchlists.id, list.id));
    expect(
      (await readLineups())
        .filter((entry) => [first.id, second.id].includes(entry.id))
        .map((entry) => entry.configuredCount),
    ).toEqual([0, 0]);
  });

  it.each([
    ["movie", "movie"],
    ["episode", "television"],
    ["anime", "television"],
    ["game", "game"],
    ["book", "book"],
    ["comic", "comic"],
    ["manga", "comic"],
  ] as const)("maps next %s items to %s", async (mediaType, key) => {
    const list = await createTestWatchlist(testDb.db, { name: `Mapping ${mediaType}` });
    await createTestWatchlistItem(testDb.db, {
      watchlistId: list.id,
      tmdbId: `mapping-${mediaType}`,
      source: "tmdb",
      mediaType,
      title: "Next",
    });
    const lineup = (await readLineups()).find((entry) => entry.systemKey === key)!;
    expect(lineup.eligibleWatchlists.map((entry) => entry.id)).toContain(list.id);
  });
});
