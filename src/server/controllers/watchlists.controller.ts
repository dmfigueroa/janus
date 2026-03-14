"use server";

import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  createImportSchema,
  getImportByJobId,
  type WatchlistImportStatus,
} from "../models/watchlist/import";
import {
  createWatchlistRecord,
  deleteWatchlistRecord,
  deleteWatchlistSchema,
  getDeprecatedWatchlistAddRejection,
  getWatchlistByIdInputSchema,
  getWatchlistByIdInternal,
  getWatchlistsInputSchema,
  listWatchlists,
  mergeWatchlistRecords,
  mergeWatchlistSchema,
  setWatchlistItemWatchedState,
  type GetWatchlistByIdResult,
  watchlistSchema,
} from "../models/watchlist";
import { enqueueImport } from "../jobs/watchlist/import.job";
import { getErrorMessage } from "../utils";

export type { GetWatchlistByIdResult };

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

const watchlistImportStatusSchema = z.object({
  jobId: z.number(),
});

const toggleWatchedSchema = z.object({
  itemId: z.number(),
  isWatched: z.boolean(),
});

export const getWatchlists = createServerFn()
  .inputValidator((data) => getWatchlistsInputSchema.parse(data || {}))
  .handler(async ({ data }) => listWatchlists(data));

export const getWatchlistById = createServerFn()
  .inputValidator((data) => getWatchlistByIdInputSchema.parse(data))
  .handler(async ({ data }) => getWatchlistByIdInternal(data));

export const createWatchlist = createServerFn()
  .inputValidator((data) => watchlistSchema.parse(data))
  .handler(async ({ data }) => createWatchlistRecord(data));

export const deleteWatchlist = createServerFn()
  .inputValidator((data) => deleteWatchlistSchema.parse(data))
  .handler(async ({ data }) => deleteWatchlistRecord(data));

export const mergeWatchlists = createServerFn({ method: "POST" })
  .inputValidator((data) => mergeWatchlistSchema.parse(data))
  .handler(async ({ data }) => mergeWatchlistRecords(data));

export const toggleWatched = createServerFn({ method: "POST" })
  .inputValidator((data) => toggleWatchedSchema.parse(data))
  .handler(async ({ data }) => {
    const result = await setWatchlistItemWatchedState(data);

    if (!result) {
      throw notFound();
    }

    return {
      kind: "updated" as const,
      itemId: result.itemId,
      isWatched: result.isWatched,
    };
  });

export const addToWatchlist = createServerFn({ method: "POST" })
  .inputValidator((data) => createImportSchema.parse(data))
  .handler(async ({ data }) => {
    const deprecatedRejection = getDeprecatedWatchlistAddRejection(data.media.mediaType);
    if (deprecatedRejection) {
      return deprecatedRejection;
    }

    try {
      const jobId = await enqueueImport(data);

      return {
        kind: "queued" as const,
        jobId,
        message: "Import started",
      };
    } catch (error) {
      const message = getErrorMessage(error);
      const suffix = error instanceof Error && error.stack ? `\n${error.stack}` : "";

      console.error(`[controllers/watchlist] addToWatchlist enqueue failed: ${message}${suffix}`, {
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
