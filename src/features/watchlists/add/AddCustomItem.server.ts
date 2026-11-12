import type { WatchlistWriteResult } from "./AdditionOutcome";
import { addToWatchlistMutation } from "./Mutation.server";
import { getWatchlistById } from "@/features/watchlists/Repository.server";
import { validateAdditionDestination } from "./AdditionDestination";
import type { CustomItemAddition } from "./AddCustomItem";

export async function addCustomItemToWatchlist(
  addition: CustomItemAddition,
): Promise<WatchlistWriteResult> {
  const watchlist = getWatchlistById(addition.watchlistId);
  const destinationFailure = validateAdditionDestination({
    watchlist,
    insertionPosition: addition.insertionPosition,
  });
  if (destinationFailure) {
    return destinationFailure;
  }

  return addToWatchlistMutation({
    watchlistId: addition.watchlistId,
    insertionPosition: addition.insertionPosition,
    referenceItemId: addition.referenceItemId,
    media: buildCustomMedia(addition),
  });
}

function buildCustomMedia(addition: CustomItemAddition) {
  const releaseDate = customReleaseDate(addition);
  if (addition.mediaType === "episode") {
    return {
      id: `custom-${crypto.randomUUID()}`,
      source: "custom" as const,
      mediaType: addition.mediaType,
      title: addition.title,
      parentId: customParentId(addition.parentTitle!),
      parentTitle: addition.parentTitle!,
      episode: addition.episode!,
      poster: null,
      year: releaseDate,
      releaseDate,
    };
  }

  return {
    id: `custom-${crypto.randomUUID()}`,
    source: "custom" as const,
    mediaType: addition.mediaType,
    title: addition.title,
    poster: null,
    year: releaseDate,
    releaseDate,
  };
}

function customReleaseDate(addition: CustomItemAddition) {
  return addition.releaseDate || addition.year || undefined;
}

function customParentId(parentTitle: string) {
  return `custom:${encodeURIComponent(parentTitle.toLocaleLowerCase())}`;
}
