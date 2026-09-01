import { z } from "zod";
import {
  discoverWatchlistPage,
  findWatchlistTitles,
} from "@/features/watchlists/detail/DiscoverWatchlist.server";
import { asMcpContent, asMcpError } from "./McpToolResponse.server";

const mediaTypeSchema = z.enum(["movie", "episode", "game", "book", "comic", "anime", "manga"]);

export async function respondToWatchlistTitles({
  watchlistId,
  pageSize,
  cursor,
}: {
  watchlistId: number;
  pageSize?: number;
  cursor?: string;
}) {
  const [watchlistPage, titlePage] = await Promise.all([
    discoverWatchlistPage({ watchlistId, pageSize: 1 }),
    findWatchlistTitles({ watchlistId, pageSize, cursor }),
  ]);
  if (!watchlistPage || !titlePage) return asMcpError(`Watchlist ${watchlistId} was not found.`);
  return asMcpContent({
    watchlist: watchlistPage.watchlist,
    titles: titlePage.titles,
    nextCursor: titlePage.nextCursor,
  });
}

export function toMcpWatchlistTitle(item: {
  source: string;
  tmdbId: string;
  mediaType: z.infer<typeof mediaTypeSchema>;
  title: string;
  parentId: string | null;
  parentTitle: string | null;
}) {
  return {
    provider: item.source,
    providerId: item.parentId ?? item.tmdbId,
    mediaType: item.mediaType,
    title: item.parentTitle ?? item.title,
    matchingItemCount: 1,
  };
}
