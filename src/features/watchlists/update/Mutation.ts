import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { updateWatchlistMutation } from "./Mutation.server";

export const updateWatchlistSchema = z
  .object({
    watchlistId: z.number(),
    name: z.string().min(1, "Name is required").optional(),
    description: z.string().nullable().optional(),
    itemOrderMode: z.enum(["release", "custom"]).optional(),
  })
  .refine(
    ({ name, description, itemOrderMode }) =>
      name !== undefined || description !== undefined || itemOrderMode !== undefined,
    "No fields to update.",
  );

export type UpdateWatchlistInput = z.infer<typeof updateWatchlistSchema>;

export const updateWatchlist = createServerFn({ method: "POST" })
  .inputValidator((data) => updateWatchlistSchema.parse(data))
  .handler(async ({ data }) => {
    return updateWatchlistMutation(data);
  });
