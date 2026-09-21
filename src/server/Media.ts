import { z } from "zod";

export const DEPRECATED_MEDIA_TYPES = ["anime", "manga"] as const;
export const DEPRECATED_MEDIA_MESSAGE =
  "Anime and manga categories are deprecated while we revisit provider data quality.";

export const isDeprecatedMediaType = (mediaType: string): boolean =>
  DEPRECATED_MEDIA_TYPES.includes(mediaType as (typeof DEPRECATED_MEDIA_TYPES)[number]);

export type WatchlistAddRejection = {
  success: false;
  message: string;
};

export const getDeprecatedWatchlistAddRejection = (
  mediaType: string,
): WatchlistAddRejection | null => {
  if (!isDeprecatedMediaType(mediaType)) {
    return null;
  }

  return {
    success: false,
    message: `${DEPRECATED_MEDIA_MESSAGE} New anime and manga items cannot be added to watchlists.`,
  };
};

const unifiedMediaBaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  poster: z.string().nullable(),
  backdrop: z.string().nullable().optional(),
  year: z.string().optional(),
  releaseDate: z.string().optional(),
  rating: z.number().optional(),
  overview: z.string().optional(),
  authors: z.array(z.string()).optional(),
  parentId: z.string().optional(),
  parentTitle: z.string().optional(),
  episode: z.string().optional(),
  source: z.enum(["tmdb", "google_books", "rawg", "comicvine", "anilist", "custom"]),
});

export const UnifiedMediaSchema = z.discriminatedUnion("mediaType", [
  unifiedMediaBaseSchema.extend({
    mediaType: z.literal("episode"),
    parentId: z.string().trim().min(1, "Parent identity is required for episodes."),
    parentTitle: z.string().trim().min(1, "Parent title is required for episodes."),
    episode: z.string().trim().min(1, "Episode label is required."),
  }),
  unifiedMediaBaseSchema.extend({
    mediaType: z.enum(["movie", "tv", "game", "book", "comic", "anime", "manga"]),
  }),
]);

export type UnifiedMedia = z.infer<typeof UnifiedMediaSchema>;
