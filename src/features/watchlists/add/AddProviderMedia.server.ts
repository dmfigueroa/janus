import type { WatchlistWriteResult } from "./AdditionOutcome";
import { addToWatchlistMutation } from "./Mutation.server";
import type { ProviderMediaAddition } from "./AddProviderMedia";
import { getWatchlistById } from "@/features/watchlists/Repository.server";
import { validateAdditionDestination } from "./AdditionDestination";
import { addDirectChildToWatchlist } from "./AddDirectChild.server";

export type ProviderMediaAdditionResult = WatchlistWriteResult;

export async function addProviderMediaToWatchlist(
  addition: ProviderMediaAddition,
): Promise<ProviderMediaAdditionResult> {
  const watchlist = getWatchlistById(addition.watchlistId);
  const destinationFailure = validateAdditionDestination({
    watchlist,
    insertionPosition: addition.insertionPosition,
  });
  if (destinationFailure) {
    return destinationFailure;
  }

  const directAddition = addDirectChildToWatchlist(addition);
  if (directAddition) return directAddition;

  return addToWatchlistMutation({
    watchlistId: addition.watchlistId,
    insertionPosition: addition.insertionPosition,
    referenceItemId: addition.referenceItemId,
    media: {
      id: addition.providerId,
      source: addition.provider,
      mediaType: addition.mediaType as Exclude<
        typeof addition.mediaType,
        "episode" | "comic_issue"
      >,
      title: "",
      poster: null,
    },
  });
}
