import { z } from "zod";

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
  source: z.enum(["tmdb", "google_books", "rawg", "comicvine", "anilist", "custom"]),
});

export type UnifiedMedia = z.infer<typeof UnifiedMediaSchema>;
