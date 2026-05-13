import { createServerFn } from "@tanstack/react-start";
import { reorderItemsSchema } from "./schema";
import { reorderItems } from "./mutation.server";

export const reorderWatchlistItems = createServerFn({ method: "POST" })
  .inputValidator((data) => reorderItemsSchema.parse(data))
  .handler(async ({ data }) => {
    return reorderItems(data);
  });
