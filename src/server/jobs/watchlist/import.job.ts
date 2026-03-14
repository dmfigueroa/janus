import { Job, Sidequest } from "sidequest";
import {
  createImport,
  importMediaIntoWatchlist,
  markImportCompleted,
  markImportFailed,
  markImportRunning,
  type CreateImportInput,
  updateImportProgress,
} from "../../models/watchlist/import";
import { getErrorMessage } from "../../utils";

export class WatchlistImportJob extends Job {
  async run(input: CreateImportInput) {
    await createImport({
      jobId: this.id,
      watchlistId: input.watchlistId,
      mediaType: input.media.mediaType,
      source: input.media.source,
      title: input.media.title,
      totalItems: 0,
    });
    await markImportRunning(this.id);

    try {
      const result = await importMediaIntoWatchlist(
        input.watchlistId,
        input.media,
        async (progress) => {
          await updateImportProgress(this.id, progress);
        },
      );

      await markImportCompleted(this.id, result.message);
      return result;
    } catch (error) {
      const message = logImportError(this.id, input, error);
      await markImportFailed(this.id, message);
      throw error;
    }
  }
}

export async function enqueueImport(input: CreateImportInput): Promise<number> {
  const job = await Sidequest.build(WatchlistImportJob).enqueue(input);

  await createImport({
    jobId: job.id,
    watchlistId: input.watchlistId,
    mediaType: input.media.mediaType,
    source: input.media.source,
    title: input.media.title,
    totalItems: 0,
  });

  return job.id;
}

function logImportError(jobId: number, input: CreateImportInput, error: unknown) {
  const message = getErrorMessage(error);
  const suffix = error instanceof Error && error.stack ? `\n${error.stack}` : "";

  console.error(`[jobs/watchlist/import] run failed for job ${jobId}: ${message}${suffix}`, {
    watchlistId: input.watchlistId,
    media: {
      id: input.media.id,
      mediaType: input.media.mediaType,
      source: input.media.source,
      title: input.media.title,
    },
  });

  return message;
}
