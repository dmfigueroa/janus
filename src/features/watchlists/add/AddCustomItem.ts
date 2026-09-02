import { z } from "zod";
import { releaseDateSchema } from "@/features/watchlists/ReleaseDate";
import { addToWatchlistInsertionPositionSchema } from "./Mutation";
import { anchorInsertionRefinement } from "./InsertionRefinement";

export const customItemMediaTypeSchema = z.enum(["movie", "tv", "book", "game", "comic"]);

export const customItemAdditionSchema = z
  .object({
    watchlistId: z.number().int().positive(),
    title: z.string().trim().min(1, "Title is required."),
    mediaType: customItemMediaTypeSchema,
    year: releaseDateSchema.optional(),
    insertionPosition: addToWatchlistInsertionPositionSchema.optional(),
    referenceItemId: z.number().int().positive().optional(),
  })
  .superRefine(anchorInsertionRefinement);

export type CustomItemAddition = z.infer<typeof customItemAdditionSchema>;
