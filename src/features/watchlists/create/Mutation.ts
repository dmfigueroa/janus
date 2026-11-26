import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createWatchlistMutation } from "./Mutation.server";

export const createWatchlistSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().optional(),
  itemOrderMode: z.enum(["release", "custom"]).optional(),
});

export type CreateWatchlistInput = z.infer<typeof createWatchlistSchema>;

export const createWatchlist = createServerFn({ method: "POST" })
  .inputValidator((data) => createWatchlistSchema.parse(data))
  .handler(async ({ data }) => {
    return createWatchlistMutation(data);
  });
