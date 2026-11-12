import { z } from "zod";
import type { WatchlistItem } from "@/db/Schema";

export const mediaTypeSchema = z.enum([
  "movie",
  "episode",
  "game",
  "book",
  "comic",
  "anime",
  "manga",
]);

export const itemOutputSchema = z.object({
  id: z.number(),
  watchlistId: z.number(),
  provider: z.string(),
  providerId: z.string(),
  mediaType: mediaTypeSchema,
  title: z.string(),
  parent: z.object({ providerId: z.string().nullable(), title: z.string().nullable() }),
  episode: z.string().nullable(),
  isWatched: z.boolean().nullable(),
});

export const titleOutputSchema = z.object({
  provider: z.string(),
  providerId: z.string(),
  mediaType: mediaTypeSchema,
  title: z.string(),
  matchingItemCount: z.number(),
});

export function toMcpWatchlistItem(item: WatchlistItem) {
  return {
    id: item.id,
    watchlistId: item.watchlistId,
    provider: item.source,
    providerId: item.tmdbId,
    mediaType: item.mediaType,
    title: item.title,
    parent: { providerId: item.parentId, title: item.parentTitle },
    episode: item.episode,
    isWatched: item.isWatched,
  };
}
