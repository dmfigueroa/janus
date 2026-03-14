import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "path";

let db: ReturnType<typeof import("../../db/db.server").getDb>;
let watchlists: typeof import("../../db/schema").watchlists;
let closeDb: typeof import("../../db/db.server").closeDb;

let createImport: typeof import("./imports").createImport;
let getImportByJobId: typeof import("./imports").getImportByJobId;
let markImportRunning: typeof import("./imports").markImportRunning;
let updateImportProgress: typeof import("./imports").updateImportProgress;
let markImportCompleted: typeof import("./imports").markImportCompleted;
let markImportFailed: typeof import("./imports").markImportFailed;

beforeAll(async () => {
  process.env.DATABASE_URL = ":memory:";

  const dbModule = await import("../../db/db.server");
  const schemaModule = await import("../../db/schema");
  const importsModule = await import("./imports");

  db = dbModule.getDb();
  closeDb = dbModule.closeDb;
  watchlists = schemaModule.watchlists;

  createImport = importsModule.createImport;
  getImportByJobId = importsModule.getImportByJobId;
  markImportRunning = importsModule.markImportRunning;
  updateImportProgress = importsModule.updateImportProgress;
  markImportCompleted = importsModule.markImportCompleted;
  markImportFailed = importsModule.markImportFailed;

  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
});

afterAll(() => {
  closeDb?.();
});

beforeEach(async () => {
  await db.delete(watchlists);
});

describe("watchlist imports", () => {
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
});
