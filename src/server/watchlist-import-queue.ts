import { type WatchlistImportRequest } from "./watchlist-import-types";
import {
  createImportProgressRecord,
  getImportProgressByJobId,
  setImportProgress,
  setImportProgressCompleted,
  setImportProgressFailed,
  setImportProgressRunning,
} from "./watchlist-import-progress";
import { getErrorMessage } from "./utils";
import { processWatchlistImport } from "./watchlist-import-service";

const WATCHLIST_IMPORT_QUEUE_NAME = "watchlist-imports";

type PendingImportJob = {
  jobId: number;
  input: WatchlistImportRequest;
};

const pendingImportJobs: PendingImportJob[] = [];
let queueWorkerPromise: Promise<void> | null = null;
let lastIssuedJobId = 0;

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
  const jobId = createJobId();

  try {
    await createImportProgressRecord({
      sidequestJobId: jobId,
      watchlistId: input.watchlistId,
      mediaType: input.media.mediaType,
      source: input.media.source,
      title: input.media.title,
      totalItems: 0,
    });

    pendingImportJobs.push({ jobId, input });
    ensureQueueWorkerRunning();
    return jobId;
  } catch (error) {
    logQueueError("enqueue", error, {
      queueName: WATCHLIST_IMPORT_QUEUE_NAME,
      jobId,
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

  return null;
}

function ensureQueueWorkerRunning() {
  if (queueWorkerPromise) {
    return;
  }

  queueWorkerPromise = runQueueWorker()
    .catch((error) => {
      logQueueError("worker.loop", error, {
        queueName: WATCHLIST_IMPORT_QUEUE_NAME,
      });
    })
    .finally(() => {
      queueWorkerPromise = null;
      if (pendingImportJobs.length > 0) {
        ensureQueueWorkerRunning();
      }
    });
}

async function runQueueWorker() {
  while (pendingImportJobs.length > 0) {
    const job = pendingImportJobs.shift();
    if (!job) {
      continue;
    }

    await executeImportJob(job);
  }
}

async function executeImportJob(job: PendingImportJob) {
  const { jobId, input } = job;

  try {
    await setImportProgressRunning(jobId);

    const result = await processWatchlistImport(
      input.watchlistId,
      input.media,
      async (progress) => {
        await setImportProgress(jobId, {
          totalItems: progress.totalItems,
          processedItems: progress.processedItems,
          insertedItems: progress.insertedItems,
          message: progress.message,
        });
      },
    );

    await setImportProgressCompleted(jobId, result.message);
  } catch (error) {
    const message = getErrorMessage(error);
    logQueueError("worker.run", error, {
      queueName: WATCHLIST_IMPORT_QUEUE_NAME,
      jobId,
      watchlistId: input.watchlistId,
      media: {
        id: input.media.id,
        mediaType: input.media.mediaType,
        source: input.media.source,
        title: input.media.title,
      },
    });
    await setImportProgressFailed(jobId, message);
  }
}

function createJobId() {
  const now = Date.now();
  if (now <= lastIssuedJobId) {
    lastIssuedJobId += 1;
    return lastIssuedJobId;
  }

  lastIssuedJobId = now;
  return lastIssuedJobId;
}

function logQueueError(
  operation: "enqueue" | "status.progress_lookup" | "worker.loop" | "worker.run",
  error: unknown,
  context: Record<string, unknown>,
) {
  const message = getErrorMessage(error);
  const suffix = error instanceof Error && error.stack ? `\n${error.stack}` : "";
  console.error(`[watchlist-import-queue] ${operation} failed: ${message}${suffix}`, context);
}
