import { z } from "zod";
import { addToWatchlistInsertionPositionSchema } from "./Mutation";

export const customItemMediaTypeSchema = z.enum(["movie", "tv", "book", "game", "comic"]);

export const customItemAdditionSchema = z.object({
  watchlistId: z.number().int().positive(),
  title: z.string().trim().min(1, "Title is required."),
  mediaType: customItemMediaTypeSchema,
  year: z.string().trim().optional(),
  insertionPosition: addToWatchlistInsertionPositionSchema.optional(),
});

export type CustomItemAddition = z.infer<typeof customItemAdditionSchema>;
