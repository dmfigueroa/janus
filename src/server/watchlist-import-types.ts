import { z } from "zod";

export const watchlistImportMediaSchema = z.object({
  id: z.string(),
  mediaType: z.enum(["movie", "tv", "game", "book", "comic", "anime", "manga"]),
  source: z.enum(["tmdb", "google_books", "rawg", "comicvine", "anilist", "custom"]),
  title: z.string(),
  poster: z.string().nullable(),
  year: z.string().optional(),
  releaseDate: z.string().optional(),
  rating: z.number().optional(),
  overview: z.string().optional(),
});

export const watchlistImportRequestSchema = z.object({
  watchlistId: z.number(),
  media: watchlistImportMediaSchema,
});

export type WatchlistImportMedia = z.infer<typeof watchlistImportMediaSchema>;
export type WatchlistImportRequest = z.infer<typeof watchlistImportRequestSchema>;
