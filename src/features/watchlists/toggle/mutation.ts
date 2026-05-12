import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const toggleWatchedSchema = z.object({
  itemId: z.number(),
  isWatched: z.boolean(),
});

export type ToggleWatchedInput = z.infer<typeof toggleWatchedSchema>;

export const toggleWatched = createServerFn({ method: "POST" })
  .inputValidator((data) => toggleWatchedSchema.parse(data))
  .handler(async ({ data }) => {
    const { toggleWatchedMutation } = await import("./mutation.server");
    return toggleWatchedMutation(data);
  });
