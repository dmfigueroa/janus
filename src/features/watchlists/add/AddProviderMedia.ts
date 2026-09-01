import { z } from "zod";
import { addToWatchlistInsertionPositionSchema } from "./Mutation";

export const providerMediaAdditionSchema = z.object({
  watchlistId: z.number().int().positive(),
  provider: z.literal("tmdb"),
  providerId: z.string().regex(/^\d+$/, "Provider ID must be a TMDB numeric ID."),
  mediaType: z.enum(["movie", "tv"]),
  insertionPosition: addToWatchlistInsertionPositionSchema.optional(),
});

export type ProviderMediaAddition = z.infer<typeof providerMediaAdditionSchema>;
