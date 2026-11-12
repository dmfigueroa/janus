import { CUSTOM_ORDER_INSERTION_REQUIRED_MESSAGE } from "./Constants";
import type { AddToWatchlistInsertionPosition } from "./Mutation";

export type DestinationValidationFailure = {
  success: false;
  code: "not_found" | "insertion_choice_required" | "not_custom_mode";
  message: string;
  affectedCount: 0;
};

export function validateAdditionDestination({
  watchlist,
  insertionPosition,
}: {
  watchlist: { itemOrderMode: "release" | "custom" } | null;
  insertionPosition?: AddToWatchlistInsertionPosition;
}): DestinationValidationFailure | null {
  if (!watchlist) {
    return watchlistNotFoundFailure();
  }
  return validateByOrderMode(watchlist.itemOrderMode, insertionPosition);
}

function validateByOrderMode(
  itemOrderMode: "release" | "custom",
  insertionPosition?: AddToWatchlistInsertionPosition,
): DestinationValidationFailure | null {
  return itemOrderMode === "custom"
    ? validateCustomMode(insertionPosition)
    : validateReleaseMode(insertionPosition);
}

function validateCustomMode(
  insertionPosition?: AddToWatchlistInsertionPosition,
): DestinationValidationFailure | null {
  return insertionPosition ? null : insertionChoiceRequired();
}

function validateReleaseMode(
  insertionPosition?: AddToWatchlistInsertionPosition,
): DestinationValidationFailure | null {
  return isAnchorPosition(insertionPosition) ? notCustomModeFailure() : null;
}

function isAnchorPosition(
  position: AddToWatchlistInsertionPosition | undefined,
): position is "before" | "after" {
  return position === "before" || position === "after";
}

function watchlistNotFoundFailure(): DestinationValidationFailure {
  return {
    success: false,
    code: "not_found",
    message: "Watchlist not found.",
    affectedCount: 0,
  };
}

function insertionChoiceRequired(): DestinationValidationFailure {
  return {
    success: false,
    code: "insertion_choice_required",
    message: CUSTOM_ORDER_INSERTION_REQUIRED_MESSAGE,
    affectedCount: 0,
  };
}

function notCustomModeFailure(): DestinationValidationFailure {
  return {
    success: false,
    code: "not_custom_mode",
    message: "Anchored insertion is only available in custom mode.",
    affectedCount: 0,
  };
}
