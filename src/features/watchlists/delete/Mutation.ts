import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { deleteWatchlistMutation } from "./Mutation.server";

export const deleteWatchlistSchema = z.object({
  id: z.number(),
});

export type DeleteWatchlistInput = z.infer<typeof deleteWatchlistSchema>;

export const deleteWatchlist = createServerFn({ method: "POST" })
  .inputValidator((data) => deleteWatchlistSchema.parse(data))
  .handler(async ({ data }) => {
    return deleteWatchlistMutation(data);
  });
