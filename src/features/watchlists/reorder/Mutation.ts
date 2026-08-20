import { createServerFn } from "@tanstack/react-start";
import { reorderItemsSchema } from "./Schema";
import { reorderItems } from "./Mutation.server";

export const reorderWatchlistItems = createServerFn({ method: "POST" })
  .inputValidator((data) => reorderItemsSchema.parse(data))
  .handler(async ({ data }) => {
    return reorderItems(data);
  });
