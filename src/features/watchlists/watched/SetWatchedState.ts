import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { setWatchedStateMutation } from "./SetWatchedState.server";

export const setWatchedStateSchema = z.object({
  itemId: z.number(),
  isWatched: z.boolean(),
  updateWatchlistRecency: z.boolean().optional(),
});

export type SetWatchedStateInput = z.infer<typeof setWatchedStateSchema>;

export const setWatchedState = createServerFn({ method: "POST" })
  .inputValidator((data) => setWatchedStateSchema.parse(data))
  .handler(async ({ data }) => {
    return setWatchedStateMutation(data);
  });
