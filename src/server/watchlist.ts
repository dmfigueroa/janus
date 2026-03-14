"use server";

import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { watchlistItems, watchlists } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/db.server";
import { isDeprecatedMediaType, DEPRECATED_MEDIA_MESSAGE } from "./media";
import { getImportByJobId, type WatchlistImportStatus } from "./watchlists/imports";
import { enqueueImport } from "./watchlists/import/queue";
import { createImportSchema } from "./watchlists/imports";
import { getErrorMessage } from "./utils";

export type { Watchlist, WatchlistItem } from "../db/schema";

const watchlistImportStatusSchema = z.object({
  jobId: z.number(),
});

export type WatchlistAddRejectedResult = {
  kind: "rejected";
  reason: "deprecated_media_type";
  message: string;
};

export type WatchlistAddQueuedResult = {
  kind: "queued";
  jobId: number;
  message: string;
};

export type WatchlistAddResult = WatchlistAddRejectedResult | WatchlistAddQueuedResult;

export type ToggleWatchedResult = {
  kind: "updated";
  itemId: number;
  isWatched: boolean;
};

export type WatchlistImportStatusResult = {
  kind: "status";
  status: WatchlistImportStatus;
};

export const getDeprecatedWatchlistAddRejection = (mediaType: string) => {
  if (!isDeprecatedMediaType(mediaType)) {
    return null;
  }

  return {
    kind: "rejected" as const,
    reason: "deprecated_media_type" as const,
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

    if (!item) {
      throw notFound();
    }

    await db
      .update(watchlistItems)
      .set({ isWatched: data.isWatched })
      .where(eq(watchlistItems.id, data.itemId));

    if (data.isWatched) {
      await db
        .update(watchlists)
        .set({ lastWatchedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(watchlists.id, item.watchlistId));
    }

    return {
      kind: "updated" as const,
      itemId: data.itemId,
      isWatched: data.isWatched,
    };
  });

export const addToWatchlist = createServerFn({ method: "POST" })
  .inputValidator((data) => createImportSchema.parse(data))
  .handler(async ({ data }) => {
    const deprecatedRejection = getDeprecatedWatchlistAddRejection(data.media.mediaType);
    if (deprecatedRejection) {
      return deprecatedRejection;
    }

    let jobId: number;
    try {
      jobId = await enqueueImport(data);
    } catch (error) {
      const message = getErrorMessage(error);
      const suffix = error instanceof Error && error.stack ? `\n${error.stack}` : "";
      console.error(`[watchlist] addToWatchlist enqueue failed: ${message}${suffix}`, {
        watchlistId: data.watchlistId,
        media: {
          id: data.media.id,
          mediaType: data.media.mediaType,
          source: data.media.source,
          title: data.media.title,
        },
      });
      throw error;
    }

    return {
      kind: "queued" as const,
      jobId,
      message: "Import started",
    };
  });

export const getWatchlistImportStatus = createServerFn({ method: "GET" })
  .inputValidator((data) => watchlistImportStatusSchema.parse(data))
  .handler(async ({ data }) => {
    const status = await getImportByJobId(data.jobId);

    if (!status) {
      throw notFound();
    }

    return {
      kind: "status" as const,
      status,
    };
  });
