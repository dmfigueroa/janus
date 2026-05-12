import { createServerFn } from "@tanstack/react-start";
import { reorderItemsSchema } from "./schema";

export const reorderWatchlistItems = createServerFn({ method: "POST" })
  .inputValidator((data) => reorderItemsSchema.parse(data))
  .handler(async ({ data }) => {
    const { WatchlistsWrite } = await import("../write.server");
    return WatchlistsWrite.reorder(data);
  });
