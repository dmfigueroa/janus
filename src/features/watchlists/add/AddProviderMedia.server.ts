import type { WatchlistWriteResult } from "./AdditionOutcome";
import { addToWatchlistMutation } from "./Mutation.server";
import type { ProviderMediaAddition } from "./AddProviderMedia";
import { validateWatchlistAdditionDestination } from "@/features/watchlists/InsertOrderedItem.server";
import { addDirectChildToWatchlist } from "./AddDirectChild.server";

export type ProviderMediaAdditionResult = WatchlistWriteResult;

export async function addProviderMediaToWatchlist(
  addition: ProviderMediaAddition,
): Promise<ProviderMediaAdditionResult> {
  const destination = validateWatchlistAdditionDestination({
    watchlistId: addition.watchlistId,
    insertionPosition: addition.insertionPosition,
  });
  if (!destination.success) {
    return destination.failure;
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
