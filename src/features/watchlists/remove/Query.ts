import { createServerFn } from "@tanstack/react-start";
import { watchlistParentRemovalSchema } from "./Schema";
import { getWatchlistParentRemovalPreview } from "./Query.server";

export const getWatchlistParentRemovalPreviewQuery = createServerFn()
  .inputValidator((data) => watchlistParentRemovalSchema.parse(data))
  .handler(async ({ data }) => {
    return getWatchlistParentRemovalPreview(data);
  });
