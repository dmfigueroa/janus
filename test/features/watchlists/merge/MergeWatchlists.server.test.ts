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
      targetWatchlistId: target.id,
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
      newWatchlistName: "Merged Queue",
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
      newWatchlistName: "Release Merge",
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
      mergeWatchlistsMutation({ sourceWatchlistIds: [], newWatchlistName: "Should Not Exist" }),
    ).resolves.toMatchObject({ success: false, code: "validation_error" });
    await expect(db.select().from(schema.watchlists)).resolves.toEqual([]);
  });
});
