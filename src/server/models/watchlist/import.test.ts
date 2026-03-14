import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "path";

let db: ReturnType<typeof import("../../../db/db.server").getDb>;
let watchlists: typeof import("../../../db/schema").watchlists;
let watchlistItems: typeof import("../../../db/schema").watchlistItems;
let watchlistImportJobs: typeof import("../../../db/schema").watchlistImportJobs;
let closeDb: typeof import("../../../db/db.server").closeDb;

let createImport: typeof import("./import").createImport;
let getImportByJobId: typeof import("./import").getImportByJobId;
let importMediaIntoWatchlist: typeof import("./import").importMediaIntoWatchlist;
let markImportCompleted: typeof import("./import").markImportCompleted;
let markImportFailed: typeof import("./import").markImportFailed;
let markImportRunning: typeof import("./import").markImportRunning;
let updateImportProgress: typeof import("./import").updateImportProgress;

beforeAll(async () => {
  process.env.DATABASE_URL = ":memory:";

  const dbModule = await import("../../../db/db.server");
  const schemaModule = await import("../../../db/schema");
  const importModelModule = await import("./import");

  db = dbModule.getDb();
  closeDb = dbModule.closeDb;
  watchlists = schemaModule.watchlists;
  watchlistItems = schemaModule.watchlistItems;
  watchlistImportJobs = schemaModule.watchlistImportJobs;
  createImport = importModelModule.createImport;
  getImportByJobId = importModelModule.getImportByJobId;
  importMediaIntoWatchlist = importModelModule.importMediaIntoWatchlist;
  markImportCompleted = importModelModule.markImportCompleted;
  markImportFailed = importModelModule.markImportFailed;
  markImportRunning = importModelModule.markImportRunning;
  updateImportProgress = importModelModule.updateImportProgress;

  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
});

afterAll(() => {
  closeDb?.();
});

beforeEach(async () => {
  await db.delete(watchlistImportJobs);
  await db.delete(watchlistItems);
  await db.delete(watchlists);
});

describe("watchlist import model", () => {
  it("creates a queued import record and retrieves it by job id", async () => {
    const [watchlist] = await db.insert(watchlists).values({ name: "Queue Test" }).returning();

    await createImport({
      jobId: 101,
      watchlistId: watchlist.id,
      mediaType: "tv",
      source: "tmdb",
      title: "The Expanse",
      totalItems: 62,
    });

    const importRecord = await getImportByJobId(101);

    expect(importRecord).not.toBeNull();
    expect(importRecord?.status).toBe("queued");
    expect(importRecord?.totalItems).toBe(62);
    expect(importRecord?.processedItems).toBe(0);
    expect(importRecord?.insertedItems).toBe(0);
  });

  it("tracks a running import through completion", async () => {
    const [watchlist] = await db.insert(watchlists).values({ name: "Progress Test" }).returning();

    await createImport({
      jobId: 202,
      watchlistId: watchlist.id,
      mediaType: "comic",
      source: "comicvine",
      title: "Saga",
      totalItems: 54,
    });

    await markImportRunning(202);
    await updateImportProgress(202, {
      processedItems: 20,
      insertedItems: 18,
      message: "18 of 54 issues added",
    });
    await markImportCompleted(202, "Completed import");

    const importRecord = await getImportByJobId(202);

    expect(importRecord?.status).toBe("completed");
    expect(importRecord?.processedItems).toBe(20);
    expect(importRecord?.insertedItems).toBe(18);
    expect(importRecord?.message).toBe("Completed import");
    expect(importRecord?.error).toBeNull();
    expect(importRecord?.startedAt).toBeTruthy();
    expect(importRecord?.completedAt).toBeTruthy();
  });

  it("tracks failed imports with an error", async () => {
    const [watchlist] = await db.insert(watchlists).values({ name: "Failure Test" }).returning();

    await createImport({
      jobId: 303,
      watchlistId: watchlist.id,
      mediaType: "tv",
      source: "tmdb",
      title: "Broken Show",
      totalItems: 10,
    });

    await markImportRunning(303);
    await markImportFailed(303, "TMDB request failed");

    const importRecord = await getImportByJobId(303);

    expect(importRecord?.status).toBe("failed");
    expect(importRecord?.message).toBeNull();
    expect(importRecord?.error).toContain("TMDB request failed");
    expect(importRecord?.startedAt).toBeTruthy();
    expect(importRecord?.completedAt).toBeTruthy();
  });

  it("adds generic media to a watchlist with progress", async () => {
    const [watchlist] = await db.insert(watchlists).values({ name: "Model Test" }).returning();
    const progressUpdates: Array<{
      processedItems: number;
      insertedItems: number;
      totalItems: number;
    }> = [];

    const result = await importMediaIntoWatchlist(
      watchlist.id,
      {
        id: "custom-book-1",
        mediaType: "book",
        source: "custom",
        title: "Dune",
        poster: null,
        year: "1965",
      },
      (progress) => {
        progressUpdates.push({
          processedItems: progress.processedItems,
          insertedItems: progress.insertedItems,
          totalItems: progress.totalItems,
        });
      },
    );

    const items = await db.select().from(watchlistItems);
    const [updatedWatchlist] = await db.select().from(watchlists);

    expect(result).toMatchObject({
      kind: "completed",
      insertedItems: 1,
      processedItems: 1,
      totalItems: 1,
      message: "Added to watchlist",
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      watchlistId: watchlist.id,
      tmdbId: "custom-book-1",
      mediaType: "book",
      source: "custom",
      title: "Dune",
      releaseDate: "1965",
    });
    expect(updatedWatchlist.lastItemAddedAt).toBeTruthy();
    expect(progressUpdates).toEqual([
      { processedItems: 0, insertedItems: 0, totalItems: 1 },
      { processedItems: 1, insertedItems: 1, totalItems: 1 },
    ]);
  });

  it("returns a noop result when the generic media already exists", async () => {
    const [watchlist] = await db.insert(watchlists).values({ name: "Duplicate Test" }).returning();
    await db.insert(watchlistItems).values({
      watchlistId: watchlist.id,
      tmdbId: "custom-book-1",
      source: "custom",
      mediaType: "book",
      title: "Dune",
      runtime: 0,
    });

    const result = await importMediaIntoWatchlist(watchlist.id, {
      id: "custom-book-1",
      mediaType: "book",
      source: "custom",
      title: "Dune",
      poster: null,
      year: "1965",
    });

    const items = await db.select().from(watchlistItems);

    expect(result).toMatchObject({
      kind: "noop",
      reason: "already_in_watchlist",
      insertedItems: 0,
      processedItems: 1,
      totalItems: 1,
      message: "Already in watchlist",
    });
    expect(items).toHaveLength(1);
  });
});
