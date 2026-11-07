import type { WatchlistWriteResult } from "./AdditionOutcome";
import { addToWatchlistMutation } from "./Mutation.server";
import type { ProviderMediaAddition } from "./AddProviderMedia";
import { getWatchlistById } from "@/features/watchlists/Repository.server";
import { CUSTOM_ORDER_INSERTION_REQUIRED_MESSAGE } from "./Constants";
import { addDirectChildToWatchlist } from "./AddDirectChild.server";

export type ProviderMediaAdditionResult = WatchlistWriteResult;

export async function addProviderMediaToWatchlist(
  addition: ProviderMediaAddition,
): Promise<ProviderMediaAdditionResult> {
  const destinationFailure = validateDestination(addition);
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

function validateDestination(addition: ProviderMediaAddition): ProviderMediaAdditionResult | null {
  const watchlist = getWatchlistById(addition.watchlistId);
  if (!watchlist) {
    return notFoundFailure();
  }

  if (isAnchorPosition(addition.insertionPosition)) {
    return anchoredDestinationCheck(watchlist.itemOrderMode);
  }

  return customInsertionFailure(watchlist.itemOrderMode, addition.insertionPosition);
}

function isAnchorPosition(
  position: ProviderMediaAddition["insertionPosition"],
): position is "before" | "after" {
  return position === "before" || position === "after";
}

function anchoredDestinationCheck(
  itemOrderMode: "release" | "custom",
): ProviderMediaAdditionResult | null {
  if (itemOrderMode !== "custom") {
    return notCustomModeFailure();
  }
  return null;
}

function notFoundFailure(): ProviderMediaAdditionResult {
  return {
    success: false,
    code: "not_found",
    message: "Watchlist not found.",
    affectedCount: 0,
  };
}

function notCustomModeFailure(): ProviderMediaAdditionResult {
  return {
    success: false,
    code: "not_custom_mode",
    message: "Anchored insertion is only available in custom mode.",
    affectedCount: 0,
  };
}

function customInsertionFailure(
  itemOrderMode: "release" | "custom",
  insertionPosition: ProviderMediaAddition["insertionPosition"],
): ProviderMediaAdditionResult | null {
  if (itemOrderMode !== "custom" || insertionPosition) {
    return null;
  }

  return {
    success: false,
    code: "insertion_choice_required",
    message: CUSTOM_ORDER_INSERTION_REQUIRED_MESSAGE,
    affectedCount: 0,
  };
}
