import path from "path";
import { WatchlistImportJob } from "./jobs/watchlist-import.job";
import { type WatchlistImportRequest } from "./watchlist-import-types";
import { createImportProgressRecord, getImportProgressByJobId } from "./watchlist-import-progress";

const WATCHLIST_IMPORT_QUEUE_NAME = "watchlist-imports";
const SIDEQUEST_JOBS_FILE_PATH = new URL(
  `./sidequest.jobs${import.meta.url.endsWith(".ts") ? ".ts" : ".js"}`,
  import.meta.url,
).href;

let sidequestStartPromise: Promise<void> | null = null;
let sidequestInstance: (typeof import("sidequest"))["Sidequest"] | null = null;
type SidequestJobState = "waiting" | "claimed" | "running" | "completed" | "failed" | "canceled";

export type WatchlistImportStatus = {
  jobId: number;
  status: "queued" | "running" | "completed" | "failed";
  totalItems: number;
  processedItems: number;
  insertedItems: number;
  message: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export async function enqueueWatchlistImport(input: WatchlistImportRequest): Promise<number> {
  const sidequest = await getSidequest();
  await ensureSidequestStarted();

  const job = await sidequest
    .build(WatchlistImportJob)
    .queue(WATCHLIST_IMPORT_QUEUE_NAME)
    .maxAttempts(1)
    .enqueue(input);

  await createImportProgressRecord({
    sidequestJobId: job.id,
    watchlistId: input.watchlistId,
    mediaType: input.media.mediaType,
    source: input.media.source,
    title: input.media.title,
    totalItems: 0,
  });

  return job.id;
}

export async function getWatchlistImportStatusByJobId(
  jobId: number,
): Promise<WatchlistImportStatus | null> {
  const progress = await getImportProgressByJobId(jobId);

  if (progress) {
    return {
      jobId,
      status: progress.status,
      totalItems: progress.totalItems,
      processedItems: progress.processedItems,
      insertedItems: progress.insertedItems,
      message: progress.message,
      error: progress.error,
      startedAt: progress.startedAt,
      completedAt: progress.completedAt,
    };
  }

  const sidequest = await getSidequest();
  await ensureSidequestStarted();
  const sidequestJob = await sidequest.job.get(jobId);

  if (!sidequestJob) {
    return null;
  }

  return {
    jobId,
    status: mapSidequestState(sidequestJob.state),
    totalItems: 0,
    processedItems: 0,
    insertedItems: 0,
    message: null,
    error: sidequestJob.errors?.at(-1)?.message || null,
    startedAt: sidequestJob.attempted_at?.toISOString() || null,
    completedAt:
      sidequestJob.completed_at?.toISOString() ||
      sidequestJob.failed_at?.toISOString() ||
      sidequestJob.canceled_at?.toISOString() ||
      null,
  };
}

async function ensureSidequestStarted() {
  const sidequest = await getSidequest();

  if (sidequestStartPromise) {
    return await sidequestStartPromise;
  }

  sidequestStartPromise = sidequest
    .start({
      backend: {
        driver: "@sidequest/sqlite-backend",
        config: resolveQueueDatabasePath(),
      },
      dashboard: {
        enabled: false,
      },
      logger: {
        level: "warn",
        json: false,
      },
      queues: [
        {
          name: WATCHLIST_IMPORT_QUEUE_NAME,
          concurrency: 1,
          priority: 100,
          state: "active",
        },
      ],
      maxConcurrentJobs: 1,
      manualJobResolution: true,
      jobsFilePath: SIDEQUEST_JOBS_FILE_PATH,
    })
    .catch((error) => {
      sidequestStartPromise = null;
      throw error;
    });

  await sidequestStartPromise;
}

function mapSidequestState(state: SidequestJobState): WatchlistImportStatus["status"] {
  if (state === "waiting") return "queued";
  if (state === "claimed" || state === "running") return "running";
  if (state === "completed") return "completed";
  return "failed";
}

async function getSidequest() {
  if (sidequestInstance) {
    return sidequestInstance;
  }

  const module = await import("sidequest");
  sidequestInstance = module.Sidequest;
  return sidequestInstance;
}

function resolveQueueDatabasePath() {
  const configuredPath = process.env.SIDEQUEST_DATABASE_URL;
  if (configuredPath) {
    return configuredPath;
  }

  const appDatabasePath = process.env.DATABASE_URL;
  if (!appDatabasePath || appDatabasePath === ":memory:") {
    return path.resolve(process.cwd(), "sidequest.sqlite");
  }

  const parsed = path.parse(appDatabasePath);
  const extension = parsed.ext || ".sqlite";
  return path.join(parsed.dir, `${parsed.name}.sidequest${extension}`);
}
