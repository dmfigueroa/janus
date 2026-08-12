import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { editWatchlistItemMutation } from "./mutation.server";

const completeCalendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Release date must be YYYY-MM-DD.")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "Release date must be a valid calendar date.");

const releaseDate = z.union([
  z.string().regex(/^\d{4}$/, "Release date must be YYYY or YYYY-MM-DD."),
  completeCalendarDate,
]);

export const editWatchlistItemSchema = z.object({
  watchlistId: z.number(),
  itemId: z.number(),
  title: z.string().trim().min(1, "Title is required."),
  releaseDate: z.union([releaseDate, z.null()]),
});

export type EditWatchlistItemInput = z.infer<typeof editWatchlistItemSchema>;

export const editWatchlistItem = createServerFn({ method: "POST" })
  .inputValidator((data) => editWatchlistItemSchema.parse(data))
  .handler(async ({ data }) => editWatchlistItemMutation(data));
