import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toggleWatchedMutation } from "./Mutation.server";

export const toggleWatchedSchema = z.object({
  itemId: z.number(),
  isWatched: z.boolean(),
  updateWatchlistRecency: z.boolean().optional(),
});

export type ToggleWatchedInput = z.infer<typeof toggleWatchedSchema>;

export const toggleWatched = createServerFn({ method: "POST" })
  .inputValidator((data) => toggleWatchedSchema.parse(data))
  .handler(async ({ data }) => {
    return toggleWatchedMutation(data);
  });
