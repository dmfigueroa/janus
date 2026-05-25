import { createServerFn } from "@tanstack/react-start";
import { moveItemToWatchlistSchema } from "./schema";
import { moveItemToWatchlistMutation } from "./mutation.server";

export const moveItemToWatchlist = createServerFn({ method: "POST" })
  .inputValidator((data) => moveItemToWatchlistSchema.parse(data))
  .handler(async ({ data }) => {
    return moveItemToWatchlistMutation(data);
  });
