import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const createWatchlistSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

export type CreateWatchlistInput = z.infer<typeof createWatchlistSchema>;

export const createWatchlist = createServerFn({ method: "POST" })
  .inputValidator((data) => createWatchlistSchema.parse(data))
  .handler(async ({ data }) => {
    const { WatchlistsWrite } = await import("../write.server");
    return WatchlistsWrite.create(data);
  });
