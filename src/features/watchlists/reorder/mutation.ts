import { createServerFn } from "@tanstack/react-start";
import { reorderItemsSchema } from "./schema";

export const reorderWatchlistItems = createServerFn({ method: "POST" })
  .inputValidator((data) => reorderItemsSchema.parse(data))
  .handler(async ({ data }) => {
    const { reorderItems } = await import("./mutation.server");
    return reorderItems(data);
  });
