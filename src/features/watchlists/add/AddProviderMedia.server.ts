import type { WatchlistWriteResult } from "./Shared.server";
import { addToWatchlistMutation } from "./Mutation.server";
import type { ProviderMediaAddition } from "./AddProviderMedia";
import { getWatchlistById } from "@/features/watchlists/Repository.server";
import { CUSTOM_ORDER_INSERTION_REQUIRED_MESSAGE } from "./Constants";
import { addDirectChildToWatchlist } from "./AddDirectChild.server";

export type ProviderMediaAdditionResult = {
  success: boolean;
  code:
    | "added"
    | "duplicate"
    | "no_new_episodes"
    | "not_found"
    | "insertion_choice_required"
    | "not_custom_mode"
    | "invalid_reference"
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

  const directAddition = addDirectChildToWatchlist(addition);
  if (directAddition) return directAddition.then(providerMediaAdditionResult);

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

function providerMediaAdditionResult(result: WatchlistWriteResult): ProviderMediaAdditionResult {
  if (!result.success) {
    return providerMediaFailure(result);
  }

  return providerMediaSuccess(result.message);
}

function providerMediaFailure(
  result: Extract<WatchlistWriteResult, { success: false }>,
): ProviderMediaAdditionResult {
  const codeFromResult = "code" in result ? result.code : undefined;
  if (isKnownFailureCode(codeFromResult)) {
    return forwardKnownCode(result, codeFromResult);
  }
  return forwardInferredCode(result);
}

function forwardKnownCode(
  result: Extract<WatchlistWriteResult, { success: false }>,
  code: ProviderMediaAdditionResult["code"],
): ProviderMediaAdditionResult {
  return {
    success: false,
    code,
    message: result.message,
    affectedCount: 0,
  };
}

function forwardInferredCode(
  result: Extract<WatchlistWriteResult, { success: false }>,
): ProviderMediaAdditionResult {
  const code = result.message === "Watchlist not found." ? "not_found" : "provider_unavailable";
  return {
    success: false,
    code,
    message: result.message,
    affectedCount: 0,
  };
}

const KNOWN_FAILURE_CODES: ProviderMediaAdditionResult["code"][] = [
  "not_found",
  "insertion_choice_required",
  "not_custom_mode",
  "invalid_reference",
];

function isKnownFailureCode(code: unknown): code is ProviderMediaAdditionResult["code"] {
  return KNOWN_FAILURE_CODES.includes(code as ProviderMediaAdditionResult["code"]);
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
    "No new issues found for this volume": "no_new_episodes",
    "No issues found for this volume": "no_new_episodes",
  } as const;
  const code = codeByMessage[message as keyof typeof codeByMessage];
  return code ? { success: true, code, message, affectedCount: 0 } : null;
}

function addedProviderMediaResult(message: string): ProviderMediaAdditionResult {
  const addedCount = message.match(
    /^Added (\d+) (?:new )?(?:episodes?|issues?) to watchlist$/,
  )?.[1];
  if (addedCount) {
    return {
      success: true,
      code: "added",
      message,
      affectedCount: Number.parseInt(addedCount, 10),
    };
  }

  return { success: true, code: "added", message, affectedCount: 1 };
}
