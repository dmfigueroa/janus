import type { WatchlistMedia } from "./Mutation";
import { getBookDetails } from "@/server/providers/GoogleBooks.server";
import type { AddToWatchlistInsertionPosition } from "./Mutation";
import { rejectAdd, type WatchlistWriteResult } from "./Shared.server";
import { addGenericItemToWatchlist } from "./AddGeneric.server";

const GOOGLE_BOOKS_FETCH_FAILURE_MESSAGE = "Failed to fetch book details from Google Books.";

export async function addBookToWatchlist(
  watchlistId: number,
  media: WatchlistMedia,
  insertionPosition?: AddToWatchlistInsertionPosition,
  referenceItemId?: number,
): Promise<WatchlistWriteResult> {
  let details: Awaited<ReturnType<typeof getBookDetails>>;
  try {
    details = await getBookDetails(media.id);
  } catch {
    return rejectAdd(GOOGLE_BOOKS_FETCH_FAILURE_MESSAGE);
  }
  return addGenericItemToWatchlist(watchlistId, details, insertionPosition, referenceItemId);
}
