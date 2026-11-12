import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { deleteWatchlistMutation } from "../delete/DeleteWatchlist.server";
import {
  pauseWatchlistMutation,
  resumeWatchlistMutation,
  skipWatchlistMutation,
} from "./WatchlistLifecycle.server";

const watchlistIdSchema = z.object({
  watchlistId: z.number().int().positive(),
});

const deleteWatchlistSchema = z.object({
  id: z.number().int().positive(),
});

export type DeleteWatchlistInput = z.infer<typeof deleteWatchlistSchema>;

export const pauseWatchlist = createServerFn({ method: "POST" })
  .inputValidator((data) => watchlistIdSchema.parse(data))
  .handler(async ({ data }) => pauseWatchlistMutation(data));

export const resumeWatchlist = createServerFn({ method: "POST" })
  .inputValidator((data) => watchlistIdSchema.parse(data))
  .handler(async ({ data }) => resumeWatchlistMutation(data));

export const skipWatchlist = createServerFn({ method: "POST" })
  .inputValidator((data) => watchlistIdSchema.parse(data))
  .handler(async ({ data }) => skipWatchlistMutation(data));

export const deleteWatchlist = createServerFn({ method: "POST" })
  .inputValidator((data) => deleteWatchlistSchema.parse(data))
  .handler(async ({ data }) => deleteWatchlistMutation(data));
