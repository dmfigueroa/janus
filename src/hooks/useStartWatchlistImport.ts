"use client";

import { useMutation } from "@tanstack/react-query";
import { UnifiedMedia } from "@/server/media";
import { addToWatchlist } from "@/server/controllers/watchlists.controller";
import { ImportResolution, getStartedImport } from "@/hooks/watchlistImportState";

interface UseStartWatchlistImportOptions {
  media: UnifiedMedia | null;
}

type StartedImport = NonNullable<ReturnType<typeof getStartedImport>>;

type StartWatchlistImportResult =
  | {
      kind: "failed";
      resolution: ImportResolution;
    }
  | {
      kind: "started";
      startedImport: StartedImport;
    };

export function useStartWatchlistImport({ media }: UseStartWatchlistImportOptions) {
  const mutation = useMutation({
    mutationFn: async (watchlistId: number) => {
      if (!media) {
        throw new Error("Media is required to add an item to a watchlist.");
      }

      return addToWatchlist({
        data: {
          watchlistId,
          media,
        },
      });
    },
  });

  const startImport = async (watchlistId: number): Promise<StartWatchlistImportResult> => {
    try {
      const result = await mutation.mutateAsync(watchlistId);
      const startedImport = getStartedImport(result);

      if (startedImport) {
        return {
          kind: "started",
          startedImport,
        };
      }

      return {
        kind: "failed",
        resolution: {
          kind: "failed",
          message: result.kind === "rejected" ? result.message : "Failed to add to watchlist",
        },
      };
    } catch (error) {
      console.error(error);

      return {
        kind: "failed",
        resolution: {
          kind: "failed",
          message: "An error occurred",
        },
      };
    }
  };

  return {
    isSubmitting: mutation.isPending,
    startImport,
  };
}
