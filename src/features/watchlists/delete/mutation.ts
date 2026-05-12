import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const deleteWatchlistSchema = z.object({
  id: z.number(),
});

export type DeleteWatchlistInput = z.infer<typeof deleteWatchlistSchema>;

export const deleteWatchlist = createServerFn({ method: "POST" })
  .inputValidator((data) => deleteWatchlistSchema.parse(data))
  .handler(async ({ data }) => {
    const { deleteWatchlistMutation } = await import("./mutation.server");
    return deleteWatchlistMutation(data);
  });
