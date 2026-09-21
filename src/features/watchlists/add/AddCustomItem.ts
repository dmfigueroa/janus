import { z } from "zod";
import { releaseDateSchema } from "@/features/watchlists/ReleaseDate";
import { addToWatchlistInsertionPositionSchema } from "./Mutation";
import { anchorInsertionRefinement } from "./InsertionRefinement";

export const customItemMediaTypeSchema = z.enum([
  "movie",
  "tv",
  "episode",
  "book",
  "game",
  "comic",
]);

export const customItemAdditionSchema = z
  .object({
    watchlistId: z.number().int().positive(),
    title: z.string().trim().min(1, "Title is required."),
    mediaType: customItemMediaTypeSchema,
    year: releaseDateSchema.optional(),
    releaseDate: releaseDateSchema.optional(),
    parentTitle: z.string().trim().min(1, "Series title is required.").optional(),
    episode: z.string().trim().min(1, "Episode label is required.").optional(),
    insertionPosition: addToWatchlistInsertionPositionSchema.optional(),
    referenceItemId: z.number().int().positive().optional(),
  })
  .superRefine((addition, context) => {
    anchorInsertionRefinement(addition, context);
    validateCustomEpisodeFields(addition, context);
  });

function validateCustomEpisodeFields(
  addition: {
    mediaType: z.infer<typeof customItemMediaTypeSchema>;
    parentTitle?: string;
    episode?: string;
  },
  context: z.RefinementCtx,
) {
  if (addition.mediaType !== "episode") return;

  [
    { value: addition.parentTitle, path: ["parentTitle"], message: "Series title is required." },
    { value: addition.episode, path: ["episode"], message: "Episode label is required." },
  ]
    .filter((field) => !field.value)
    .forEach((field) => {
      context.addIssue({ code: z.ZodIssueCode.custom, path: field.path, message: field.message });
    });
}

export type CustomItemAddition = z.infer<typeof customItemAdditionSchema>;
