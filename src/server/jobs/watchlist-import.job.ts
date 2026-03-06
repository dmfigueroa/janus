import { Job } from "@sidequest/core";
import { getErrorMessage } from "../utils";
import { type WatchlistImportRequest } from "../watchlist-import-types";
import {
  setImportProgress,
  setImportProgressCompleted,
  setImportProgressFailed,
  setImportProgressRunning,
} from "../watchlist-import-progress";
import { processWatchlistImport } from "../watchlist-import-service";

export class WatchlistImportJob extends Job {
  async run(input: WatchlistImportRequest) {
    await setImportProgressRunning(this.id);

    try {
      const result = await processWatchlistImport(
        input.watchlistId,
        input.media,
        async (progress) => {
          await setImportProgress(this.id, {
            totalItems: progress.totalItems,
            processedItems: progress.processedItems,
            insertedItems: progress.insertedItems,
            message: progress.message,
          });
        },
      );

      await setImportProgressCompleted(this.id, result.message);
      return result;
    } catch (error) {
      const message = getErrorMessage(error);
      await setImportProgressFailed(this.id, message);
      throw error;
    }
  }
}
