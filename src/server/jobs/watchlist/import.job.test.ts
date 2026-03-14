import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "path";
import type { JobData } from "sidequest";

vi.mock("sidequest", async () => {
  class MockJob {
    id = 0;

    injectJobData(jobData: JobData) {
      this.id = jobData.id;
    }
  }

  return {
    Job: MockJob,
    Sidequest: {
      build: vi.fn(),
    },
  };
});

let db: ReturnType<typeof import("../../../db/db.server").getDb>;
let watchlists: typeof import("../../../db/schema").watchlists;
let watchlistItems: typeof import("../../../db/schema").watchlistItems;
let watchlistImportJobs: typeof import("../../../db/schema").watchlistImportJobs;
let closeDb: typeof import("../../../db/db.server").closeDb;

let Sidequest: typeof import("sidequest").Sidequest;
let WatchlistImportJob: typeof import("./import.job").WatchlistImportJob;
let enqueueImport: typeof import("./import.job").enqueueImport;
let getImportByJobId: typeof import("../../models/watchlist/import").getImportByJobId;

beforeAll(async () => {
  process.env.DATABASE_URL = ":memory:";

  const dbModule = await import("../../../db/db.server");
  const schemaModule = await import("../../../db/schema");
  const sidequestModule = await import("sidequest");
  const importJobModule = await import("./import.job");
  const importModelModule = await import("../../models/watchlist/import");

  db = dbModule.getDb();
  closeDb = dbModule.closeDb;
  watchlists = schemaModule.watchlists;
  watchlistItems = schemaModule.watchlistItems;
  watchlistImportJobs = schemaModule.watchlistImportJobs;
  Sidequest = sidequestModule.Sidequest;
  WatchlistImportJob = importJobModule.WatchlistImportJob;
  enqueueImport = importJobModule.enqueueImport;
  getImportByJobId = importModelModule.getImportByJobId;

  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
});

afterAll(() => {
  closeDb?.();
});

beforeEach(async () => {
  vi.clearAllMocks();
  delete process.env.TMDB_API_KEY;
  await db.delete(watchlistImportJobs);
  await db.delete(watchlistItems);
  await db.delete(watchlists);
});

describe("watchlist import job orchestration", () => {
  it("enqueues a Sidequest job and persists the queued import", async () => {
    const [watchlist] = await db.insert(watchlists).values({ name: "Enqueue Test" }).returning();
    const enqueue = vi.fn().mockResolvedValue({ id: 987 });
    vi.mocked(Sidequest.build).mockReturnValue({ enqueue } as unknown as ReturnType<
      typeof Sidequest.build
    >);

    const jobId = await enqueueImport({
      watchlistId: watchlist.id,
      media: {
        id: "custom-book-1",
        mediaType: "book",
        source: "custom",
        title: "Dune",
        poster: null,
        year: "1965",
      },
    });

    const status = await getImportByJobId(jobId);

    expect(Sidequest.build).toHaveBeenCalledWith(WatchlistImportJob);
    expect(enqueue).toHaveBeenCalledWith({
      watchlistId: watchlist.id,
      media: {
        id: "custom-book-1",
        mediaType: "book",
        source: "custom",
        title: "Dune",
        poster: null,
        year: "1965",
      },
    });
    expect(jobId).toBe(987);
    expect(status).toMatchObject({
      jobId: 987,
      status: "queued",
      totalItems: 0,
      processedItems: 0,
      insertedItems: 0,
      message: null,
      error: null,
    });
  });

  it("runs a generic import through completion and persists progress", async () => {
    const [watchlist] = await db.insert(watchlists).values({ name: "Job Run Test" }).returning();
    const job = new WatchlistImportJob();
    job.injectJobData(createJobData(404));

    const result = await job.run({
      watchlistId: watchlist.id,
      media: {
        id: "custom-book-2",
        mediaType: "book",
        source: "custom",
        title: "Hyperion",
        poster: null,
        year: "1989",
      },
    });

    const status = await getImportByJobId(404);
    const items = await db.select().from(watchlistItems);

    expect(result).toMatchObject({
      kind: "completed",
      insertedItems: 1,
      processedItems: 1,
      totalItems: 1,
      message: "Added to watchlist",
    });
    expect(status).toMatchObject({
      jobId: 404,
      status: "completed",
      insertedItems: 1,
      processedItems: 1,
      totalItems: 1,
      message: "Added to watchlist",
      error: null,
    });
    expect(status?.startedAt).toBeTruthy();
    expect(status?.completedAt).toBeTruthy();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      watchlistId: watchlist.id,
      tmdbId: "custom-book-2",
      mediaType: "book",
      title: "Hyperion",
    });
  });

  it("marks the import as failed when model logic rejects", async () => {
    process.env.TMDB_API_KEY = "test-key";
    const [watchlist] = await db
      .insert(watchlists)
      .values({ name: "Job Failure Test" })
      .returning();
    const job = new WatchlistImportJob();
    job.injectJobData(createJobData(505));

    await expect(
      job.run({
        watchlistId: watchlist.id,
        media: {
          id: "bad",
          mediaType: "movie",
          source: "tmdb",
          title: "Broken Movie",
          poster: null,
        },
      }),
    ).rejects.toThrow("Invalid tmdb media id: bad");

    const status = await getImportByJobId(505);
    const items = await db.select().from(watchlistItems);

    expect(status).toMatchObject({
      jobId: 505,
      status: "failed",
      insertedItems: 0,
      processedItems: 0,
      totalItems: 0,
      message: null,
      error: "Invalid tmdb media id: bad",
    });
    expect(status?.startedAt).toBeTruthy();
    expect(status?.completedAt).toBeTruthy();
    expect(items).toHaveLength(0);
  });
});

function createJobData(id: number): JobData {
  const now = new Date();

  return {
    id,
    script: "src/server/sidequest.jobs.ts",
    queue: "default",
    state: "waiting",
    class: "WatchlistImportJob",
    args: [],
    constructor_args: [],
    attempt: 0,
    max_attempts: 25,
    inserted_at: now,
    available_at: now,
    timeout: null,
    result: null,
    errors: null,
    attempted_at: null,
    completed_at: null,
    failed_at: null,
    canceled_at: null,
    claimed_at: null,
    claimed_by: null,
    unique_digest: null,
    uniqueness_config: null,
    backoff_strategy: "exponential",
    retry_delay: null,
  };
}
