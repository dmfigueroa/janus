import type { WatchlistWriteResult } from "./AdditionOutcome";
import { addToWatchlistMutation, UNSUPPORTED_TV_SOURCE_MESSAGE } from "./Mutation.server";
import { getWatchlistById } from "@/features/watchlists/Repository.server";
import { CUSTOM_ORDER_INSERTION_REQUIRED_MESSAGE } from "./Constants";
import type { CustomItemAddition } from "./AddCustomItem";

export type CustomItemAdditionResult = {
  success: boolean;
  code:
    | "added"
    | "not_found"
    | "unsupported"
    | "insertion_choice_required"
    | "not_custom_mode"
    | "invalid_reference"
    | "failed";
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
    referenceItemId: addition.referenceItemId,
    media: buildCustomMedia(addition),
  }).then(customItemAdditionResult);
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
    return customItemFailure(result);
  }

  return { success: true, code: "added", message: result.message, affectedCount: 1 };
}

function customItemFailure(
  result: Extract<WatchlistWriteResult, { success: false }>,
): CustomItemAdditionResult {
  const forwardedCode = forwardKnownCode(result);
  if (forwardedCode) {
    return { success: false, code: forwardedCode, message: result.message, affectedCount: 0 };
  }
  return inferFailure(result);
}

const KNOWN_FAILURE_CODES: CustomItemAdditionResult["code"][] = [
  "not_found",
  "insertion_choice_required",
  "not_custom_mode",
  "invalid_reference",
];

function forwardKnownCode(
  result: Extract<WatchlistWriteResult, { success: false }>,
): CustomItemAdditionResult["code"] | null {
  if (!("code" in result)) return null;
  return knownFailureCodeOrNull(result.code);
}

function knownFailureCodeOrNull(code: unknown): CustomItemAdditionResult["code"] | null {
  if (typeof code !== "string") return null;
  if ((KNOWN_FAILURE_CODES as string[]).includes(code)) {
    return code as CustomItemAdditionResult["code"];
  }
  return null;
}

function inferFailure(
  result: Extract<WatchlistWriteResult, { success: false }>,
): CustomItemAdditionResult {
  const code = result.message === UNSUPPORTED_TV_SOURCE_MESSAGE ? "unsupported" : "failed";
  return {
    success: false,
    code,
    message: result.message,
    affectedCount: 0,
  };
}
