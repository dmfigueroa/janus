import { createServerFn } from "@tanstack/react-start";
import { moveItemToWatchlistSchema, moveParentToWatchlistSchema } from "./schema";
import {
  moveItemToWatchlistMutation,
  moveParentAndChildrenToWatchlistMutation,
} from "./mutation.server";

export const moveItemToWatchlist = createServerFn({ method: "POST" })
  .inputValidator((data) => moveItemToWatchlistSchema.parse(data))
  .handler(async ({ data }) => {
    return moveItemToWatchlistMutation(data);
  });

export const moveParentToWatchlist = createServerFn({ method: "POST" })
  .inputValidator((data) => moveParentToWatchlistSchema.parse(data))
  .handler(async ({ data }) => {
    return moveParentAndChildrenToWatchlistMutation(data);
  });
