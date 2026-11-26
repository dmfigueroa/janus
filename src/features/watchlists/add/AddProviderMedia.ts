import { z } from "zod";
import {
  anilistIdSchema,
  comicVineIdSchema,
  googleBooksIdSchema,
  rawgIdSchema,
  tmdbIdSchema,
} from "@/integrations/ProviderIds";
import { addToWatchlistInsertionPositionSchema } from "./Mutation";
import { anchorInsertionRefinement } from "./InsertionRefinement";

const providerMediaAdditionBaseSchema = z.object({
  watchlistId: z.number().int().positive(),
  providerId: z.string().trim().min(1, "Provider ID is required."),
  insertionPosition: addToWatchlistInsertionPositionSchema.optional(),
  referenceItemId: z.number().int().positive().optional(),
});

const parentSchema = z.object({
  providerId: z.string().trim().min(1).nullable().optional(),
  title: z.string().trim().min(1).nullable().optional(),
});

export const providerMediaAdditionSchema = z
  .union([
    providerMediaAdditionBaseSchema.extend({
      provider: z.literal("tmdb"),
      providerId: tmdbIdSchema,
      mediaType: z.enum(["movie", "tv"]),
    }),
    providerMediaAdditionBaseSchema.extend({
      provider: z.literal("tmdb"),
      providerId: tmdbIdSchema,
      mediaType: z.literal("episode"),
      parent: parentSchema.extend({
        providerId: z
          .string()
          .trim()
          .regex(/^(?:tmdb:)?\d+$/, "Parent provider ID must be a TMDB numeric ID.")
          .refine((providerId) => {
            const numericId = Number(providerId.replace(/^tmdb:/, ""));
            return Number.isSafeInteger(numericId) && numericId > 0;
          }, "Parent provider ID must be a positive safe integer."),
      }),
    }),
    providerMediaAdditionBaseSchema.extend({
      provider: z.literal("rawg"),
      providerId: rawgIdSchema,
      mediaType: z.literal("game"),
    }),
    providerMediaAdditionBaseSchema.extend({
      provider: z.literal("google_books"),
      providerId: googleBooksIdSchema,
      mediaType: z.literal("book"),
    }),
    providerMediaAdditionBaseSchema.extend({
      provider: z.literal("comicvine"),
      providerId: comicVineIdSchema,
      mediaType: z.literal("comic"),
      parent: parentSchema.optional(),
    }),
    providerMediaAdditionBaseSchema.extend({
      provider: z.literal("comicvine"),
      providerId: comicVineIdSchema,
      mediaType: z.literal("comic_issue"),
      parent: parentSchema.optional(),
    }),
    providerMediaAdditionBaseSchema.extend({
      provider: z.literal("anilist"),
      providerId: anilistIdSchema,
      mediaType: z.enum(["anime", "manga"]),
    }),
  ])
  .superRefine(anchorInsertionRefinement);

export type ProviderMediaAddition = z.input<typeof providerMediaAdditionSchema>;
