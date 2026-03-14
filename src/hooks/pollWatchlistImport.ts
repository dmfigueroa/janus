"use client";

import {
  ImportResolution,
  getImportResolution,
  getImportStatusMessage,
} from "@/hooks/watchlistImportState";
import { getWatchlistImportStatus } from "@/server/watchlist";

const IMPORT_POLL_INTERVAL_MS = 1000;

interface PollWatchlistImportOptions {
  isCurrentRequest: () => boolean;
  jobId: number;
  onProgress: (message: string | null) => void;
}

interface CancelledImportResolution {
  kind: "cancelled";
  message: string;
}

export type WatchlistImportRunResolution = ImportResolution | CancelledImportResolution;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function pollWatchlistImport({
  isCurrentRequest,
  jobId,
  onProgress,
}: PollWatchlistImportOptions): Promise<WatchlistImportRunResolution> {
  while (isCurrentRequest()) {
    const importStatusData = await getWatchlistImportStatus({ data: { jobId } });

    if (!isCurrentRequest()) {
      break;
    }

    onProgress(getImportStatusMessage(importStatusData));

    const importResolution = getImportResolution(importStatusData);
    if (importResolution) {
      return importResolution;
    }

    await sleep(IMPORT_POLL_INTERVAL_MS);
  }

  return {
    kind: "cancelled",
    message: "Import cancelled",
  };
}
