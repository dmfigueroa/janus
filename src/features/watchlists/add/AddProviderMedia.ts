import { z } from "zod";
import { addToWatchlistInsertionPositionSchema } from "./Mutation";
import { anchorInsertionRefinement } from "./InsertionRefinement";

const providerMediaAdditionBaseSchema = z.object({
  watchlistId: z.number().int().positive(),
  providerId: z.string().trim().min(1, "Provider ID is required."),
  insertionPosition: addToWatchlistInsertionPositionSchema.optional(),
  referenceItemId: z.number().int().positive().optional(),
});

const parentSchema = z.object({
  providerId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
});

export const providerMediaAdditionSchema = z
  .union([
    providerMediaAdditionBaseSchema.extend({
      provider: z.literal("tmdb"),
      providerId: z.string().regex(/^\d+$/, "Provider ID must be a TMDB numeric ID."),
      mediaType: z.enum(["movie", "tv"]),
    }),
    providerMediaAdditionBaseSchema.extend({
      provider: z.literal("tmdb"),
      providerId: z.string().regex(/^\d+$/, "Provider ID must be a TMDB numeric ID."),
      mediaType: z.literal("episode"),
      parent: parentSchema.extend({
        providerId: z.string().trim().min(1, "Parent provider ID is required for episodes."),
      }),
    }),
    providerMediaAdditionBaseSchema.extend({
      provider: z.literal("rawg"),
      mediaType: z.literal("game"),
    }),
    providerMediaAdditionBaseSchema.extend({
      provider: z.literal("google_books"),
      mediaType: z.literal("book"),
    }),
    providerMediaAdditionBaseSchema.extend({
      provider: z.literal("comicvine"),
      mediaType: z.literal("comic"),
    }),
    providerMediaAdditionBaseSchema.extend({
      provider: z.literal("comicvine"),
      mediaType: z.literal("comic_issue"),
      parent: parentSchema.optional(),
    }),
    providerMediaAdditionBaseSchema.extend({
      provider: z.literal("anilist"),
      mediaType: z.enum(["anime", "manga"]),
    }),
  ])
  .superRefine(anchorInsertionRefinement);

export type ProviderMediaAddition = z.infer<typeof providerMediaAdditionSchema>;
