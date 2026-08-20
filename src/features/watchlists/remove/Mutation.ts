import { createServerFn } from "@tanstack/react-start";
import { removeWatchlistItemSchema, watchlistParentRemovalSchema } from "./Schema";
import { removeWatchlistItemMutation, removeWatchlistParentMutation } from "./Mutation.server";

export const removeWatchlistItem = createServerFn({ method: "POST" })
  .inputValidator((data) => removeWatchlistItemSchema.parse(data))
  .handler(async ({ data }) => {
    return removeWatchlistItemMutation(data);
  });

export const removeWatchlistParent = createServerFn({ method: "POST" })
  .inputValidator((data) => watchlistParentRemovalSchema.parse(data))
  .handler(async ({ data }) => {
    return removeWatchlistParentMutation(data);
  });
