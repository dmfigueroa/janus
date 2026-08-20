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

export const UnifiedMediaSchema = z.object({
  id: z.string(),
  mediaType: z.enum(["movie", "tv", "game", "book", "comic", "anime", "manga"]),
  title: z.string(),
  poster: z.string().nullable(),
  backdrop: z.string().nullable().optional(),
  year: z.string().optional(),
  releaseDate: z.string().optional(),
  rating: z.number().optional(),
  overview: z.string().optional(),
  authors: z.array(z.string()).optional(),
  source: z.enum(["tmdb", "google_books", "rawg", "comicvine", "anilist", "custom"]),
});

export type UnifiedMedia = z.infer<typeof UnifiedMediaSchema>;
