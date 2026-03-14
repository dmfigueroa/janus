import { createImport, getImportByJobId } from "../imports";
import { getErrorMessage } from "../../utils";
import { runImport } from "../imports";
import { type CreateImportInput } from "./contracts";

type PendingImport = {
  jobId: number;
  input: CreateImportInput;
};

const pendingImports: PendingImport[] = [];
let queueWorkerPromise: Promise<void> | null = null;
let lastIssuedJobId = 0;

export async function enqueueImport(input: CreateImportInput): Promise<number> {
  const jobId = createJobId();

  try {
    await createImport({
      jobId,
      watchlistId: input.watchlistId,
      mediaType: input.media.mediaType,
      source: input.media.source,
      title: input.media.title,
      totalItems: 0,
    });

    pendingImports.push({ jobId, input });
    ensureQueueWorkerRunning();
    return jobId;
  } catch (error) {
    logQueueError("enqueue", error, {
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

export async function getQueuedImport(jobId: number) {
  return await getImportByJobId(jobId);
}

function ensureQueueWorkerRunning() {
  if (queueWorkerPromise) {
    return;
  }

  queueWorkerPromise = runQueueWorker()
    .catch((error) => {
      logQueueError("worker.loop", error, {});
    })
    .finally(() => {
      queueWorkerPromise = null;
      if (pendingImports.length > 0) {
        ensureQueueWorkerRunning();
      }
    });
}

async function runQueueWorker() {
  while (pendingImports.length > 0) {
    const pendingImport = pendingImports.shift();
    if (!pendingImport) {
      continue;
    }

    try {
      await runImport(pendingImport.jobId, pendingImport.input);
    } catch {
      // Import state and logging are handled by the resource module.
    }
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
  operation: "enqueue" | "worker.loop",
  error: unknown,
  context: Record<string, unknown>,
) {
  const message = getErrorMessage(error);
  const suffix = error instanceof Error && error.stack ? `\n${error.stack}` : "";
  console.error(`[watchlists/import/queue] ${operation} failed: ${message}${suffix}`, context);
}
