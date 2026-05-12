import type { WatchlistMedia } from "@/features/watchlists/mutations";
import { getBookDetails } from "@/server/providers/google-books.server";
import { rejectAdd, type WatchlistWriteResult } from "./shared.server";
import { addGenericItemToWatchlist } from "./add-generic.server";

const GOOGLE_BOOKS_FETCH_FAILURE_MESSAGE = "Failed to fetch book details from Google Books.";

export async function addBookToWatchlist(
  watchlistId: number,
  media: WatchlistMedia,
): Promise<WatchlistWriteResult> {
  let details: Awaited<ReturnType<typeof getBookDetails>>;
  try {
    details = await getBookDetails(media.id);
  } catch {
    return rejectAdd(GOOGLE_BOOKS_FETCH_FAILURE_MESSAGE);
  }
  return addGenericItemToWatchlist(watchlistId, details);
}
