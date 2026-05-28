import { watchlistItems } from "@/db/schema";

export type ItemInsertFields = Omit<
  typeof watchlistItems.$inferSelect,
  "id" | "watchlistId" | "customRank"
>;

export function extractItemFields(item: typeof watchlistItems.$inferSelect): ItemInsertFields {
  return {
    tmdbId: item.tmdbId,
    source: item.source,
    mediaType: item.mediaType,
    title: item.title,
    parentId: item.parentId,
    parentTitle: item.parentTitle,
    season: item.season,
    episode: item.episode,
    posterPath: item.posterPath,
    releaseDate: item.releaseDate,
    voteAverage: item.voteAverage,
    runtime: item.runtime,
    isWatched: item.isWatched,
    authors: item.authors,
    addedAt: item.addedAt,
  };
}
