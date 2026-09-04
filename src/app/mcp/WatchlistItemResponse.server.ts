import { z } from "zod";

const mediaTypeSchema = z.enum(["movie", "episode", "game", "book", "comic", "anime", "manga"]);

export function toMcpWatchlistItem(item: {
  id: number;
  watchlistId: number;
  source: string;
  tmdbId: string;
  mediaType: z.infer<typeof mediaTypeSchema>;
  title: string;
  parentId: string | null;
  parentTitle: string | null;
  episode: string | null;
  isWatched: boolean | null;
}) {
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
