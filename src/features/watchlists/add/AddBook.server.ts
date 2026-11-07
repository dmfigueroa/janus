import { providerAdditionFailure } from "./ProviderAdditionFailure.server";
import type { WatchlistMedia } from "./Mutation";
import { getBookDetails } from "@/server/providers/GoogleBooks.server";
import type { AddToWatchlistInsertionPosition } from "./Mutation";
import { type WatchlistWriteResult } from "./AdditionOutcome";
import { addGenericItemToWatchlist } from "./AddGeneric.server";

export async function addBookToWatchlist(
  watchlistId: number,
  media: WatchlistMedia,
  insertionPosition?: AddToWatchlistInsertionPosition,
  referenceItemId?: number,
): Promise<WatchlistWriteResult> {
  let details: Awaited<ReturnType<typeof getBookDetails>>;
  try {
    details = await getBookDetails(media.id);
  } catch (error) {
    return providerAdditionFailure(error, "Google Books");
  }
  return addGenericItemToWatchlist(watchlistId, details, insertionPosition, referenceItemId);
}
