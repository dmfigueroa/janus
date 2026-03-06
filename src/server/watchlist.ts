"use server";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { watchlistItems, watchlists } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/db.server";
import { isDeprecatedMediaType, DEPRECATED_MEDIA_MESSAGE } from "./media";
import { enqueueWatchlistImport, getWatchlistImportStatusByJobId } from "./watchlist-import-queue";
import { watchlistImportRequestSchema } from "./watchlist-import-types";

export type { Watchlist, WatchlistItem } from "../db/schema";

const watchlistImportStatusSchema = z.object({
  jobId: z.number(),
});

export const getDeprecatedWatchlistAddRejection = (mediaType: string) => {
  if (!isDeprecatedMediaType(mediaType)) {
    return null;
  }

  return {
    success: false,
    message: `${DEPRECATED_MEDIA_MESSAGE} New anime and manga items cannot be added to watchlists.`,
  };
};

export const toggleWatched = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ itemId: z.number(), isWatched: z.boolean() }).parse(data))
  .handler(async ({ data }) => {
    const db = getDb();
    const [item] = await db
      .select({ watchlistId: watchlistItems.watchlistId })
      .from(watchlistItems)
      .where(eq(watchlistItems.id, data.itemId));

    await db
      .update(watchlistItems)
      .set({ isWatched: data.isWatched })
      .where(eq(watchlistItems.id, data.itemId));

    if (item && data.isWatched) {
      await db
        .update(watchlists)
        .set({ lastWatchedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(watchlists.id, item.watchlistId));
    }

    return { success: true };
  });

export const addToWatchlist = createServerFn({ method: "POST" })
  .inputValidator((data) => watchlistImportRequestSchema.parse(data))
  .handler(async ({ data }) => {
    const deprecatedRejection = getDeprecatedWatchlistAddRejection(data.media.mediaType);
    if (deprecatedRejection) {
      return deprecatedRejection;
    }

    const jobId = await enqueueWatchlistImport(data);

    return {
      success: true,
      queued: true,
      jobId,
      message: "Import started",
    };
  });

export const getWatchlistImportStatus = createServerFn({ method: "GET" })
  .inputValidator((data) => watchlistImportStatusSchema.parse(data))
  .handler(async ({ data }) => {
    const status = await getWatchlistImportStatusByJobId(data.jobId);

    if (!status) {
      return {
        success: false,
        message: "Import job not found",
      };
    }

    return {
      success: true,
      status,
    };
  });
