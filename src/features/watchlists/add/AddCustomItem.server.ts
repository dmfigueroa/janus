import type { WatchlistWriteResult } from "./Shared.server";
import { addToWatchlistMutation, UNSUPPORTED_TV_SOURCE_MESSAGE } from "./Mutation.server";
import { getWatchlistById } from "@/features/watchlists/Repository.server";
import { CUSTOM_ORDER_INSERTION_REQUIRED_MESSAGE } from "./Constants";
import type { CustomItemAddition } from "./AddCustomItem";

export type CustomItemAdditionResult = {
  success: boolean;
  code: "added" | "not_found" | "unsupported" | "insertion_choice_required" | "failed";
  message: string;
  affectedCount: number;
};

export async function addCustomItemToWatchlist(
  addition: CustomItemAddition,
): Promise<CustomItemAdditionResult> {
  const destinationFailure = validateDestination(addition);
  if (destinationFailure) {
    return destinationFailure;
  }

  return addToWatchlistMutation({
    watchlistId: addition.watchlistId,
    insertionPosition: addition.insertionPosition,
    media: buildCustomMedia(addition),
  }).then(customItemAdditionResult);
}

function buildCustomMedia(addition: CustomItemAddition) {
  const year = addition.year || undefined;
  return {
    id: `custom-${crypto.randomUUID()}`,
    source: "custom" as const,
    mediaType: addition.mediaType,
    title: addition.title,
    poster: null,
    year,
    releaseDate: year,
  };
}

function validateDestination(addition: CustomItemAddition): CustomItemAdditionResult | null {
  const watchlist = getWatchlistById(addition.watchlistId);
  if (!watchlist) {
    return {
      success: false,
      code: "not_found",
      message: "Watchlist not found.",
      affectedCount: 0,
    };
  }

  return customInsertionFailure(watchlist.itemOrderMode, addition.insertionPosition);
}

function customInsertionFailure(
  itemOrderMode: "release" | "custom",
  insertionPosition: CustomItemAddition["insertionPosition"],
): CustomItemAdditionResult | null {
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

function customItemAdditionResult(result: WatchlistWriteResult): CustomItemAdditionResult {
  if (!result.success) {
    return customItemFailure(result.message);
  }

  return { success: true, code: "added", message: result.message, affectedCount: 1 };
}

function customItemFailure(message: string): CustomItemAdditionResult {
  return {
    success: false,
    code: message === UNSUPPORTED_TV_SOURCE_MESSAGE ? "unsupported" : "failed",
    message,
    affectedCount: 0,
  };
}
