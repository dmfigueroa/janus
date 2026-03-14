import path from "path";
import { WatchlistImportJob } from "./jobs/watchlist-import.job";
import { type WatchlistImportRequest } from "./watchlist-import-types";
import { createImportProgressRecord, getImportProgressByJobId } from "./watchlist-import-progress";
import { getErrorMessage } from "./utils";

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
  try {
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
  } catch (error) {
    logQueueError("enqueue", error, {
      queueName: WATCHLIST_IMPORT_QUEUE_NAME,
      watchlistId: input.watchlistId,
      media: {
        id: input.media.id,
        mediaType: input.media.mediaType,
        source: input.media.source,
        title: input.media.title,
      },
    });
    throw error;
  }
}

export async function getWatchlistImportStatusByJobId(
  jobId: number,
): Promise<WatchlistImportStatus | null> {
  let progress = null;
  try {
    progress = await getImportProgressByJobId(jobId);
  } catch (error) {
    logQueueError("status.progress_lookup", error, { jobId });
    throw error;
  }

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

  try {
    const sidequest = await getSidequest();
    await ensureSidequestStarted();

    const sidequestJob = await sidequest.job.get(jobId);

    if (!sidequestJob) {
      return null;
    }

    return {
      jobId,
      status: mapSidequestState(sidequestJob.state as SidequestJobState),
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
  } catch (error) {
    logQueueError("status.sidequest_lookup", error, {
      jobId,
      queueName: WATCHLIST_IMPORT_QUEUE_NAME,
    });
    throw error;
  }
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
      logQueueError("sidequest.start", error, {
        queueName: WATCHLIST_IMPORT_QUEUE_NAME,
        jobsFilePath: SIDEQUEST_JOBS_FILE_PATH,
        queueDatabasePath: resolveQueueDatabasePath(),
      });
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

function logQueueError(
  operation: "enqueue" | "status.progress_lookup" | "status.sidequest_lookup" | "sidequest.start",
  error: unknown,
  context: Record<string, unknown>,
) {
  const message = getErrorMessage(error);
  const suffix = error instanceof Error && error.stack ? `\n${error.stack}` : "";
  console.error(`[watchlist-import-queue] ${operation} failed: ${message}${suffix}`, context);
}
