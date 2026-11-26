import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/Schema";
import { createIsolatedTestDb, type IsolatedTestDb } from "@test/IsolatedDb";
import {
  createTestWatchlist,
  createTestWatchlistItem,
} from "@test/features/watchlists/test/WatchlistTestData.server";

const dbState = vi.hoisted(() => ({ db: undefined as IsolatedTestDb | undefined }));
vi.mock("@/db/Db.server", () => ({ getDb: () => dbState.db }));

let testDb: Awaited<ReturnType<typeof createIsolatedTestDb>>;
let db: IsolatedTestDb;
let mergeWatchlistsMutation: typeof import("@/features/watchlists/merge/Mutation.server").mergeWatchlistsMutation;
let readWatchlistDetail: typeof import("@/features/watchlists/Read.server").WatchlistsRead.detailScreen;

function getMergeTargetId(result: Awaited<ReturnType<typeof mergeWatchlistsMutation>>) {
  if (!result.success) throw new Error(result.message);
  return result.targetId;
}

beforeAll(async () => {
  testDb = await createIsolatedTestDb();
  db = testDb.db;
  dbState.db = db;
  const [mergeModule, readModule] = await Promise.all([
    import("@/features/watchlists/merge/Mutation.server"),
    import("@/features/watchlists/Read.server"),
  ]);
  mergeWatchlistsMutation = mergeModule.mergeWatchlistsMutation;
  readWatchlistDetail = readModule.WatchlistsRead.detailScreen;
});

afterAll(() => testDb.close());

beforeEach(async () => {
  await db.delete(schema.watchlistItems);
  await db.delete(schema.watchlists);
});

describe("merge watchlists mutation", () => {
  it("preserves existing target lifecycle and creates new targets unpaused at the back", async () => {
    const target = await createTestWatchlist(db, {
      name: "Paused target",
      pausedAt: "2001-01-01 00:00:00",
      lastWatchedAt: "2000-01-01 00:00:00",
    });
    const source = await createTestWatchlist(db, {
      name: "Source",
      pausedAt: "2002-01-01 00:00:00",
    });
    await createTestWatchlistItem(db, { watchlistId: source.id, tmdbId: "source" });
    const existing = await mergeWatchlistsMutation({
      target: { kind: "existing", watchlistId: target.id },
      sourceWatchlistIds: [source.id],
    });
    expect(existing).toEqual({ success: true, targetId: target.id });
    const existingDetail = await readWatchlistDetail({ watchlistId: target.id });
    expect(existingDetail?.watchlist).toMatchObject({
      pausedAt: target.pausedAt,
      lastWatchedAt: target.lastWatchedAt,
    });
    const merged = await mergeWatchlistsMutation({
      target: { kind: "new", name: "New merge" },
      sourceWatchlistIds: [target.id],
    });
    const detail = await readWatchlistDetail({ watchlistId: getMergeTargetId(merged) });
    expect(detail?.watchlist.pausedAt).toBeNull();
    expect(detail?.watchlist.lastWatchedAt).not.toBeNull();
    expect(detail?.watchlist.lastWatchedAt! > target.lastWatchedAt!).toBe(true);
  });

  it("merges selected lists into an existing target and keeps watched duplicates", async () => {
    const target = await createTestWatchlist(db, { name: "Target" });
    const source = await createTestWatchlist(db, { name: "Source" });
    const untouched = await createTestWatchlist(db, { name: "Untouched" });
    await createTestWatchlistItem(db, {
      watchlistId: target.id,
      tmdbId: "shared",
      source: "tmdb",
      mediaType: "movie",
      title: "Shared",
      releaseDate: "2024-01-01",
      isWatched: false,
    });
    await createTestWatchlistItem(db, {
      watchlistId: source.id,
      tmdbId: "shared",
      source: "tmdb",
      mediaType: "movie",
      title: "Shared",
      releaseDate: "2024-01-01",
      isWatched: true,
    });
    await createTestWatchlistItem(db, {
      watchlistId: source.id,
      tmdbId: "source-only",
      source: "tmdb",
      mediaType: "movie",
      title: "Source Only",
      releaseDate: "2024-02-01",
    });
    await createTestWatchlistItem(db, {
      watchlistId: untouched.id,
      tmdbId: "untouched",
      source: "tmdb",
      mediaType: "movie",
      title: "Untouched",
    });

    const result = await mergeWatchlistsMutation({
      target: { kind: "existing", watchlistId: target.id },
      sourceWatchlistIds: [target.id, source.id],
    });
    const targetDetail = await readWatchlistDetail({
      watchlistId: target.id,
      unwatchedOnly: false,
    });

    expect(result).toEqual({ success: true, targetId: target.id });
    expect(targetDetail?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tmdbId: "shared", isWatched: true }),
        expect.objectContaining({ tmdbId: "source-only" }),
      ]),
    );
    expect(targetDetail?.watchlist.stats).toMatchObject({ totalItems: 2, watchedItems: 1 });
    await expect(readWatchlistDetail({ watchlistId: source.id })).resolves.toBeNull();
    await expect(readWatchlistDetail({ watchlistId: untouched.id })).resolves.toMatchObject({
      items: [expect.objectContaining({ tmdbId: "untouched" })],
    });
  });

  const booleanWatchedStates = [false, true] as const;
  const booleanWatchedPairs = booleanWatchedStates.flatMap((targetWatched) =>
    booleanWatchedStates.map((sourceWatched) => ({
      targetWatched,
      sourceWatched,
      expectedWatched: targetWatched || sourceWatched,
    })),
  );

  it.each(booleanWatchedPairs)(
    "enforces join-semilattice watched state on release-order merge (target=$targetWatched, source=$sourceWatched -> $expectedWatched)",
    async ({ targetWatched, sourceWatched, expectedWatched }) => {
      const target = await createTestWatchlist(db, { name: "Release Target" });
      const source = await createTestWatchlist(db, { name: "Release Source" });
      await createTestWatchlistItem(db, {
        watchlistId: target.id,
        tmdbId: "shared-release",
        title: "Shared Release",
        isWatched: targetWatched,
      });
      await createTestWatchlistItem(db, {
        watchlistId: source.id,
        tmdbId: "shared-release",
        title: "Shared Release",
        isWatched: sourceWatched,
      });

      const result = await mergeWatchlistsMutation({
        target: { kind: "existing", watchlistId: target.id },
        sourceWatchlistIds: [source.id],
      });

      expect(result).toEqual({ success: true, targetId: target.id });
      const detail = await readWatchlistDetail({
        watchlistId: target.id,
        unwatchedOnly: false,
      });
      expect(detail?.items).toEqual([
        expect.objectContaining({ tmdbId: "shared-release", isWatched: expectedWatched }),
      ]);
    },
  );

  it.each(booleanWatchedPairs)(
    "enforces join-semilattice watched state on custom-order merge (target=$targetWatched, source=$sourceWatched -> $expectedWatched)",
    async ({ targetWatched, sourceWatched, expectedWatched }) => {
      const target = await createTestWatchlist(db, {
        name: "Custom Target",
        itemOrderMode: "custom",
      });
      const source = await createTestWatchlist(db, {
        name: "Custom Source",
        itemOrderMode: "custom",
      });
      await createTestWatchlistItem(db, {
        watchlistId: target.id,
        tmdbId: "shared-custom",
        title: "Shared Custom",
        customRank: 1,
        isWatched: targetWatched,
      });
      await createTestWatchlistItem(db, {
        watchlistId: source.id,
        tmdbId: "shared-custom",
        title: "Shared Custom",
        customRank: 1,
        isWatched: sourceWatched,
      });

      const result = await mergeWatchlistsMutation({
        target: { kind: "existing", watchlistId: target.id },
        sourceWatchlistIds: [source.id],
      });

      expect(result).toEqual({ success: true, targetId: target.id });
      const detail = await readWatchlistDetail({
        watchlistId: target.id,
        unwatchedOnly: false,
      });
      expect(detail?.items).toEqual([
        expect.objectContaining({ tmdbId: "shared-custom", isWatched: expectedWatched }),
      ]);
    },
  );

  const legacyWatchedStates = [null, 0, 1] as const;
  const legacyWatchedPairs = legacyWatchedStates.flatMap((targetWatched) =>
    legacyWatchedStates.map((sourceWatched) => ({
      targetWatched,
      sourceWatched,
      expectedWatched: targetWatched === 1 || sourceWatched === 1,
    })),
  );

  it.each(legacyWatchedPairs)(
    "guards legacy nullable is_watched rows on pre-migration merges (target=$targetWatched, source=$sourceWatched -> $expectedWatched)",
    async ({ targetWatched, sourceWatched, expectedWatched }) => {
      const legacyDb = await createIsolatedTestDb({ maxMigrationIndex: 11 });
      const previousDb = dbState.db;
      dbState.db = legacyDb.db;
      try {
        for (const itemOrderMode of ["release", "custom"] as const) {
          const target = await createTestWatchlist(legacyDb.db, {
            name: `Legacy ${itemOrderMode} Target`,
            itemOrderMode,
          });
          const source = await createTestWatchlist(legacyDb.db, {
            name: `Legacy ${itemOrderMode} Source`,
            itemOrderMode,
          });
          const insert = legacyDb.sqlite.prepare(
            "INSERT INTO watchlist_items(watchlist_id, tmdb_id, source, media_type, title, custom_rank, is_watched) VALUES(?, ?, 'tmdb', 'movie', ?, ?, ?)",
          );
          const rank = itemOrderMode === "custom" ? 1 : null;
          insert.run(target.id, `shared-${itemOrderMode}`, "Shared Legacy", rank, targetWatched);
          insert.run(source.id, `shared-${itemOrderMode}`, "Shared Legacy", rank, sourceWatched);
          insert.run(
            source.id,
            `source-only-${itemOrderMode}`,
            "Source Only Legacy",
            itemOrderMode === "custom" ? 2 : null,
            sourceWatched,
          );

          const result = await mergeWatchlistsMutation({
            target: { kind: "existing", watchlistId: target.id },
            sourceWatchlistIds: [source.id],
          });
          expect(result).toEqual({ success: true, targetId: target.id });

          const detail = await readWatchlistDetail({
            watchlistId: target.id,
            unwatchedOnly: false,
          });
          const shared = detail?.items.find((item) => item.tmdbId === `shared-${itemOrderMode}`);
          const sourceOnly = detail?.items.find(
            (item) => item.tmdbId === `source-only-${itemOrderMode}`,
          );
          expect(shared?.isWatched).toBe(expectedWatched);
          expect(sourceOnly?.isWatched).toBe(sourceWatched === 1);
        }
      } finally {
        dbState.db = previousDb;
        legacyDb.close();
      }
    },
  );
});

describe("new target merge", () => {
  it("creates a new target when given a name", async () => {
    const firstSource = await createTestWatchlist(db, { name: "First Source" });
    const secondSource = await createTestWatchlist(db, { name: "Second Source" });
    await createTestWatchlistItem(db, {
      watchlistId: firstSource.id,
      tmdbId: "movie-1",
      source: "tmdb",
      mediaType: "movie",
      title: "First Movie",
    });
    await createTestWatchlistItem(db, {
      watchlistId: secondSource.id,
      tmdbId: "movie-2",
      source: "tmdb",
      mediaType: "movie",
      title: "Second Movie",
    });

    const result = await mergeWatchlistsMutation({
      sourceWatchlistIds: [firstSource.id, secondSource.id],
      target: { kind: "new", name: "  Merged Queue  " },
    });
    const targetId = getMergeTargetId(result);
    const detail = await readWatchlistDetail({
      watchlistId: targetId,
      unwatchedOnly: false,
    });

    expect(detail?.watchlist).toMatchObject({
      name: "Merged Queue",
      description: "Merged watchlist",
    });
    expect(detail?.items.map((item) => item.tmdbId)).toEqual(["movie-1", "movie-2"]);
    await expect(readWatchlistDetail({ watchlistId: firstSource.id })).resolves.toBeNull();
    await expect(readWatchlistDetail({ watchlistId: secondSource.id })).resolves.toBeNull();
  });

  it("uses release ordering when all sources use release order", async () => {
    const firstSource = await createTestWatchlist(db, { name: "First Source" });
    const secondSource = await createTestWatchlist(db, { name: "Second Source" });
    await createTestWatchlistItem(db, {
      watchlistId: firstSource.id,
      tmdbId: "march",
      source: "tmdb",
      mediaType: "movie",
      title: "March Release",
      releaseDate: "2024-03-01",
    });
    await createTestWatchlistItem(db, {
      watchlistId: secondSource.id,
      tmdbId: "january",
      source: "tmdb",
      mediaType: "movie",
      title: "January Release",
      releaseDate: "2024-01-01",
    });
    await createTestWatchlistItem(db, {
      watchlistId: secondSource.id,
      tmdbId: "february",
      source: "tmdb",
      mediaType: "movie",
      title: "February Release",
      releaseDate: "2024-02-01",
    });

    const result = await mergeWatchlistsMutation({
      sourceWatchlistIds: [firstSource.id, secondSource.id],
      target: { kind: "new", name: "Release Merge" },
    });
    const detail = await readWatchlistDetail({
      watchlistId: getMergeTargetId(result),
      unwatchedOnly: false,
    });

    expect(detail?.items.map((item) => item.title)).toEqual([
      "January Release",
      "February Release",
      "March Release",
    ]);
  });
});

describe("merge validation", () => {
  it("rejects a merge without source watchlists", async () => {
    await expect(
      mergeWatchlistsMutation({
        sourceWatchlistIds: [],
        target: { kind: "new", name: "Should Not Exist" },
      }),
    ).resolves.toMatchObject({ success: false, code: "validation_error" });
    await expect(db.select().from(schema.watchlists)).resolves.toEqual([]);
  });

  it("rejects a merge with a whitespace-only new target name", async () => {
    const source = await createTestWatchlist(db, { name: "Source" });
    await expect(
      mergeWatchlistsMutation({
        sourceWatchlistIds: [source.id],
        target: { kind: "new", name: "   " },
      }),
    ).resolves.toMatchObject({ success: false, code: "validation_error" });
    await expect(readWatchlistDetail({ watchlistId: source.id })).resolves.not.toBeNull();
  });
});

describe("lineup membership during merge", () => {
  it.each(["existing", "new"] as const)(
    "preserves the union for a %s target",
    async (targetKind) => {
      const { readLineups } = await import("@/features/lineups/read/LineupRead.server");
      const { createLineup, setLineupWatchlists } =
        await import("@/features/lineups/manage/LineupConfiguration.server");
      const first = await createTestWatchlist(db, { name: "First" });
      const second = await createTestWatchlist(db, { name: "Second" });
      const firstLineup = await createLineup(`First ${targetKind}`);
      const secondLineup = await createLineup(`Second ${targetKind}`);
      if (!firstLineup.success || !secondLineup.success) throw new Error("Lineup creation failed");
      await setLineupWatchlists({ kind: "custom", id: firstLineup.id }, [first.id]);
      await setLineupWatchlists({ kind: "custom", id: secondLineup.id }, [second.id]);
      const result = await mergeWatchlistsMutation(
        targetKind === "existing"
          ? {
              target: { kind: "existing", watchlistId: first.id },
              sourceWatchlistIds: [second.id],
            }
          : {
              target: { kind: "new", name: "Merged" },
              sourceWatchlistIds: [first.id, second.id],
            },
      );
      const targetId = getMergeTargetId(result);
      const customLineups = (await readLineups()).filter((lineup) => lineup.kind === "custom");
      expect(
        customLineups
          .find((lineup) => lineup.id === firstLineup.id)
          ?.configuredWatchlists.map((list) => list.id),
      ).toEqual([targetId]);
      expect(
        customLineups
          .find((lineup) => lineup.id === secondLineup.id)
          ?.configuredWatchlists.map((list) => list.id),
      ).toEqual([targetId]);
    },
  );
});
