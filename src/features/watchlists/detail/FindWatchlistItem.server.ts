import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/Db.server";
import { watchlistItems } from "@/db/Schema";

export async function findWatchlistItemById({
  watchlistId,
  watchlistItemId,
}: {
  watchlistId: number;
  watchlistItemId: number;
}) {
  return getDb()
    .select()
    .from(watchlistItems)
    .where(
      and(eq(watchlistItems.watchlistId, watchlistId), eq(watchlistItems.id, watchlistItemId)),
    );
}

export async function findWatchlistItemByProvider({
  watchlistId,
  provider,
  providerId,
  mediaType,
}: {
  watchlistId: number;
  provider: string;
  providerId: string;
  mediaType: (typeof watchlistItems.$inferSelect)["mediaType"];
}) {
  return getDb()
    .select()
    .from(watchlistItems)
    .where(
      and(
        eq(watchlistItems.watchlistId, watchlistId),
        eq(watchlistItems.source, provider),
        eq(watchlistItems.tmdbId, providerId),
        eq(watchlistItems.mediaType, mediaType),
      ),
    );
}
