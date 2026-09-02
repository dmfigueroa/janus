import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pauseWatchlistMutation, resumeWatchlistMutation } from "./PauseWatchlist.server";

const watchlistPauseSchema = z.object({
  watchlistId: z.number().int().positive(),
});

export type PauseWatchlistInput = z.infer<typeof watchlistPauseSchema>;
export type ResumeWatchlistInput = z.infer<typeof watchlistPauseSchema>;

export const pauseWatchlist = createServerFn({ method: "POST" })
  .inputValidator((data) => watchlistPauseSchema.parse(data))
  .handler(async ({ data }) => {
    return pauseWatchlistMutation(data);
  });

export const resumeWatchlist = createServerFn({ method: "POST" })
  .inputValidator((data) => watchlistPauseSchema.parse(data))
  .handler(async ({ data }) => {
    return resumeWatchlistMutation(data);
  });
