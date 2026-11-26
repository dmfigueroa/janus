import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  comicVineIdSchema,
  googleBooksIdSchema,
  rawgIdSchema,
  tmdbIdSchema,
} from "@/integrations/ProviderIds";
import { UnifiedMediaSchema } from "@/server/Media";
import { addToWatchlistMutation } from "./Mutation.server";
import { anchorInsertionRefinement } from "./InsertionRefinement";

export const addToWatchlistInsertionPositionSchema = z.enum([
  "beginning",
  "end",
  "before",
  "after",
]);

const providerIdSchemaBySource: Partial<Record<string, z.ZodTypeAny>> = {
  google_books: googleBooksIdSchema,
  rawg: rawgIdSchema,
  comicvine: comicVineIdSchema,
};

const tmdbTitleMediaTypes = new Set(["movie", "tv"]);

type ProviderMediaIdentity = {
  id: string;
  source: string;
  mediaType: string;
};

export const addToWatchlistSchema = z
  .object({
    watchlistId: z.number(),
    media: UnifiedMediaSchema,
    insertionPosition: addToWatchlistInsertionPositionSchema.optional(),
    referenceItemId: z.number().int().positive().optional(),
  })
  .superRefine(anchorInsertionRefinement)
  .superRefine((value, context) => {
    refineWatchlistMediaId(value.media, context);
  });

function providerIdSchemaFor(media: ProviderMediaIdentity) {
  if (media.source === "tmdb") return tmdbMovieOrShowId(media.mediaType);
  return providerIdSchemaBySource[media.source];
}

function tmdbMovieOrShowId(mediaType: string) {
  if (tmdbTitleMediaTypes.has(mediaType)) return tmdbIdSchema;
  return undefined;
}

function refineWatchlistMediaId(media: ProviderMediaIdentity, context: z.RefinementCtx) {
  const schema = providerIdSchemaFor(media);
  if (!schema) return;
  rejectInvalidProviderId(schema, media.id, context);
}

function rejectInvalidProviderId(schema: z.ZodTypeAny, id: string, context: z.RefinementCtx) {
  const parsed = schema.safeParse(id);
  if (parsed.success) return;
  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: providerIdIssueMessage(parsed.error),
    path: ["media", "id"],
  });
}

function providerIdIssueMessage(error: z.ZodError) {
  const issue = error.issues[0];
  if (issue) return issue.message;
  return "Invalid provider id.";
}

export type AddToWatchlistInput = z.infer<typeof addToWatchlistSchema>;
export type AddToWatchlistInsertionPosition = z.infer<typeof addToWatchlistInsertionPositionSchema>;
export type WatchlistMedia = AddToWatchlistInput["media"];
export type GenericMedia = Omit<WatchlistMedia, "mediaType"> & {
  mediaType: Exclude<WatchlistMedia["mediaType"], "tv">;
};

export const addToWatchlist = createServerFn({ method: "POST" })
  .inputValidator((data) => addToWatchlistSchema.parse(data))
  .handler(async ({ data }) => {
    return addToWatchlistMutation(data);
  });
