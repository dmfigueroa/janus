import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "path";

let db: ReturnType<typeof import("../db/db.server").getDb>;
let watchlists: typeof import("../db/schema").watchlists;
let closeDb: typeof import("../db/db.server").closeDb;

let createImportProgressRecord: typeof import("./watchlist-import-progress").createImportProgressRecord;
let getImportProgressByJobId: typeof import("./watchlist-import-progress").getImportProgressByJobId;
let setImportProgressRunning: typeof import("./watchlist-import-progress").setImportProgressRunning;
let setImportProgress: typeof import("./watchlist-import-progress").setImportProgress;
let setImportProgressCompleted: typeof import("./watchlist-import-progress").setImportProgressCompleted;
let setImportProgressFailed: typeof import("./watchlist-import-progress").setImportProgressFailed;

beforeAll(async () => {
  process.env.DATABASE_URL = ":memory:";

  const dbModule = await import("../db/db.server");
  const schemaModule = await import("../db/schema");
  const importProgressModule = await import("./watchlist-import-progress");

  db = dbModule.getDb();
  closeDb = dbModule.closeDb;
  watchlists = schemaModule.watchlists;

  createImportProgressRecord = importProgressModule.createImportProgressRecord;
  getImportProgressByJobId = importProgressModule.getImportProgressByJobId;
  setImportProgressRunning = importProgressModule.setImportProgressRunning;
  setImportProgress = importProgressModule.setImportProgress;
  setImportProgressCompleted = importProgressModule.setImportProgressCompleted;
  setImportProgressFailed = importProgressModule.setImportProgressFailed;

  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
});

afterAll(() => {
  closeDb?.();
});

beforeEach(async () => {
  await db.delete(watchlists);
});

describe("watchlist import progress", () => {
  it("creates a queued progress record and retrieves it by sidequest job id", async () => {
    const [watchlist] = await db.insert(watchlists).values({ name: "Queue Test" }).returning();

    await createImportProgressRecord({
      sidequestJobId: 101,
      watchlistId: watchlist.id,
      mediaType: "tv",
      source: "tmdb",
      title: "The Expanse",
      totalItems: 62,
    });

    const progress = await getImportProgressByJobId(101);

    expect(progress).not.toBeNull();
    expect(progress?.status).toBe("queued");
    expect(progress?.totalItems).toBe(62);
    expect(progress?.processedItems).toBe(0);
    expect(progress?.insertedItems).toBe(0);
  });

  it("tracks running progress and completion", async () => {
    const [watchlist] = await db.insert(watchlists).values({ name: "Progress Test" }).returning();

    await createImportProgressRecord({
      sidequestJobId: 202,
      watchlistId: watchlist.id,
      mediaType: "comic",
      source: "comicvine",
      title: "Saga",
      totalItems: 54,
    });

    await setImportProgressRunning(202);
    await setImportProgress(202, {
      processedItems: 20,
      insertedItems: 18,
      message: "18 of 54 issues added",
    });
    await setImportProgressCompleted(202, "Completed import");

    const progress = await getImportProgressByJobId(202);

    expect(progress?.status).toBe("completed");
    expect(progress?.processedItems).toBe(20);
    expect(progress?.insertedItems).toBe(18);
    expect(progress?.message).toBe("Completed import");
    expect(progress?.startedAt).toBeTruthy();
    expect(progress?.completedAt).toBeTruthy();
  });

  it("marks failed imports with error details", async () => {
    const [watchlist] = await db.insert(watchlists).values({ name: "Failure Test" }).returning();

    await createImportProgressRecord({
      sidequestJobId: 303,
      watchlistId: watchlist.id,
      mediaType: "tv",
      source: "tmdb",
      title: "Broken Show",
      totalItems: 10,
    });

    await setImportProgressRunning(303);
    await setImportProgressFailed(303, "TMDB request failed");

    const progress = await getImportProgressByJobId(303);

    expect(progress?.status).toBe("failed");
    expect(progress?.error).toContain("TMDB request failed");
  });
});
