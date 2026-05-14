import { createServerFn } from "@tanstack/react-start";
import { watchlistParentRemovalSchema } from "./schema";
import { getWatchlistParentRemovalPreview } from "./query.server";

export const getWatchlistParentRemovalPreviewQuery = createServerFn()
  .inputValidator((data) => watchlistParentRemovalSchema.parse(data))
  .handler(async ({ data }) => {
    return getWatchlistParentRemovalPreview(data);
  });
