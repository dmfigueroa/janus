"use client";

import { useRef, useState } from "react";
import { UnifiedMedia } from "@/server/media";
import { useStartWatchlistImport } from "@/hooks/useStartWatchlistImport";
import { WatchlistImportRunResolution, pollWatchlistImport } from "@/hooks/pollWatchlistImport";

interface UseWatchlistImportWorkflowOptions {
  media: UnifiedMedia | null;
}

type WatchlistImportWorkflowStatus =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "importing"; message: string | null }
  | { kind: "failed"; message: string };

interface StartImportResult {
  resolution: WatchlistImportRunResolution;
}

export function useWatchlistImportWorkflow({ media }: UseWatchlistImportWorkflowOptions) {
  const activeRequestIdRef = useRef(0);
  const [status, setStatus] = useState<WatchlistImportWorkflowStatus>({ kind: "idle" });
  const { startImport: startWatchlistImport } = useStartWatchlistImport({ media });

  const resetImportWorkflow = () => {
    activeRequestIdRef.current += 1;
    setStatus({ kind: "idle" });
  };

  const startImport = async (watchlistId: number): Promise<StartImportResult> => {
    const requestId = activeRequestIdRef.current + 1;
    activeRequestIdRef.current = requestId;
    setStatus({ kind: "submitting" });

    const result = await startWatchlistImport(watchlistId);

    if (result.kind === "started") {
      setStatus({ kind: "importing", message: result.startedImport.message });

      return {
        resolution: await pollWatchlistImport({
          jobId: result.startedImport.jobId,
          isCurrentRequest: () => requestId === activeRequestIdRef.current,
          onProgress: (message) => setStatus({ kind: "importing", message }),
        }),
      };
    }

    setStatus({ kind: "failed", message: result.resolution.message });

    return { resolution: result.resolution };
  };

  return {
    resetImportWorkflow,
    startImport,
    status,
  };
}
