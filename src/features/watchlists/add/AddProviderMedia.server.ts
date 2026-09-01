import type { WatchlistWriteResult } from "./Shared.server";
import { addToWatchlistMutation } from "./Mutation.server";
import type { ProviderMediaAddition } from "./AddProviderMedia";
import { getWatchlistById } from "@/features/watchlists/Repository.server";
import { CUSTOM_ORDER_INSERTION_REQUIRED_MESSAGE } from "./Constants";

export type ProviderMediaAdditionResult = {
  success: boolean;
  code:
    | "added"
    | "duplicate"
    | "no_new_episodes"
    | "not_found"
    | "insertion_choice_required"
    | "provider_unavailable";
  message: string;
  affectedCount: number;
};

export async function addProviderMediaToWatchlist(
  addition: ProviderMediaAddition,
): Promise<ProviderMediaAdditionResult> {
  const destinationFailure = validateDestination(addition);
  if (destinationFailure) {
    return destinationFailure;
  }

  return addToWatchlistMutation({
    watchlistId: addition.watchlistId,
    insertionPosition: addition.insertionPosition,
    media: {
      id: addition.providerId,
      source: addition.provider,
      mediaType: addition.mediaType,
      title: "",
      poster: null,
    },
  })
    .then(providerMediaAdditionResult)
    .catch(providerUnavailableResult);
}

function providerUnavailableResult(): ProviderMediaAdditionResult {
  return {
    success: false,
    code: "provider_unavailable",
    message: "TMDB is temporarily unavailable. Please try again later.",
    affectedCount: 0,
  };
}

function validateDestination(addition: ProviderMediaAddition): ProviderMediaAdditionResult | null {
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

function providerMediaAdditionResult(result: WatchlistWriteResult): ProviderMediaAdditionResult {
  if (!result.success) {
    return providerMediaFailure(result.message);
  }

  return providerMediaSuccess(result.message);
}

function providerMediaFailure(message: string): ProviderMediaAdditionResult {
  return {
    success: false,
    code: message === "Watchlist not found." ? "not_found" : "provider_unavailable",
    message,
    affectedCount: 0,
  };
}

function providerMediaSuccess(message: string): ProviderMediaAdditionResult {
  const noChangeResult = noChangeProviderMediaResult(message);
  if (noChangeResult) {
    return noChangeResult;
  }

  return addedProviderMediaResult(message);
}

function noChangeProviderMediaResult(message: string): ProviderMediaAdditionResult | null {
  const codeByMessage = {
    "Already in watchlist": "duplicate",
    "No new episodes found for this show": "no_new_episodes",
    "No episodes found for this show": "no_new_episodes",
  } as const;
  const code = codeByMessage[message as keyof typeof codeByMessage];
  return code ? { success: true, code, message, affectedCount: 0 } : null;
}

function addedProviderMediaResult(message: string): ProviderMediaAdditionResult {
  const episodeCount = message.match(/^Added (\d+) new episodes? to watchlist$/)?.[1];
  if (episodeCount) {
    return {
      success: true,
      code: "added",
      message,
      affectedCount: Number.parseInt(episodeCount, 10),
    };
  }

  return { success: true, code: "added", message, affectedCount: 1 };
}
