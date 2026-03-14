"use client";

import { addToWatchlist, getWatchlistImportStatus } from "@/server/watchlist";

type AddToWatchlistResult = Awaited<ReturnType<typeof addToWatchlist>>;
type ImportStatusResult = Awaited<ReturnType<typeof getWatchlistImportStatus>>;

interface ImportStarted {
  jobId: number;
  message: string;
}

export interface ImportResolution {
  kind: "completed" | "failed";
  message: string;
}

export function getStartedImport(result: AddToWatchlistResult): ImportStarted | null {
  if (!result.success) {
    return null;
  }

  if (!("jobId" in result) || typeof result.jobId !== "number") {
    return null;
  }

  return {
    jobId: result.jobId,
    message: result.message || "Import started",
  };
}

export function getImportStatusMessage(result: ImportStatusResult | undefined) {
  if (!result?.success) {
    return null;
  }

  return (
    result.status.message ||
    `${result.status.insertedItems} of ${result.status.totalItems} items added`
  );
}

export function getImportResolution(
  result: ImportStatusResult | undefined,
): ImportResolution | null {
  if (!result?.success) {
    return null;
  }

  const { status } = result.status;

  if (status === "completed") {
    return {
      kind: "completed",
      message: result.status.message || "Import completed",
    };
  }

  if (status === "failed") {
    return {
      kind: "failed",
      message: result.status.error || "Import failed",
    };
  }

  return null;
}
