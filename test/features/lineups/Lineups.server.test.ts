import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createIsolatedTestDb, type IsolatedTestDb } from "@test/IsolatedDb";
import {
  createTestWatchlist,
  createTestWatchlistItem,
} from "@test/features/watchlists/test/WatchlistTestData.server";

const state = vi.hoisted(() => ({ db: undefined as IsolatedTestDb | undefined }));
vi.mock("@/db/Db.server", () => ({ getDb: () => state.db }));
let testDb: Awaited<ReturnType<typeof createIsolatedTestDb>>;
let listLineups: typeof import("@/features/lineups/Lineups.server").listLineups;
let createLineup: typeof import("@/features/lineups/Lineups.server").createLineup;
let readLineups: typeof import("@/features/lineups/Lineups.server").readLineups;
let setLineupWatchlists: typeof import("@/features/lineups/Lineups.server").setLineupWatchlists;
let reorderLineups: typeof import("@/features/lineups/Lineups.server").reorderLineups;
let updateLineup: typeof import("@/features/lineups/Lineups.server").updateLineup;
let deleteLineup: typeof import("@/features/lineups/Lineups.server").deleteLineup;

beforeAll(async () => {
  testDb = await createIsolatedTestDb();
  state.db = testDb.db;
  ({
    listLineups,
    createLineup,
    readLineups,
    setLineupWatchlists,
    reorderLineups,
    updateLineup,
    deleteLineup,
  } = await import("@/features/lineups/Lineups.server"));
});
afterAll(() => testDb.close());

describe("lineups", () => {
  it("starts with the five enabled automatic lineups in their existing order", async () => {
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
    expect(await createLineup("WEEKNIGHTS")).toMatchObject({ success: false });
    expect(await createLineup("movies")).toMatchObject({ success: false });
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
    expect(await deleteLineup(reference)).toMatchObject({ success: true });
    expect((await readLineups()).find((entry) => entry.id === created.id)).toBeUndefined();
  });
});
