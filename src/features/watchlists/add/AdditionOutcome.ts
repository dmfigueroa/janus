export type WatchlistWriteFailureCode =
  | "not_found"
  | "insertion_choice_required"
  | "not_custom_mode"
  | "invalid_reference"
  | "validation_error"
  | "unsupported"
  | "provider_unavailable"
  | "provider_not_configured";

export type WatchlistWriteFailure = {
  success: false;
  code: WatchlistWriteFailureCode;
  message: string;
  affectedCount: 0;
};

export type WatchlistWriteResult =
  | {
      success: true;
      code: "added" | "duplicate" | "no_new_items";
      message: string;
      affectedCount: number;
    }
  | WatchlistWriteFailure;

export function rejectAdd(
  message: string,
  code: WatchlistWriteFailureCode = "validation_error",
): WatchlistWriteFailure {
  return { success: false, code, message, affectedCount: 0 };
}

export function addedItemsResult(
  affectedCount: number,
  message: string,
  unchangedCode: "duplicate" | "no_new_items" = "duplicate",
): WatchlistWriteResult {
  return {
    success: true,
    code: affectedCount > 0 ? "added" : unchangedCode,
    message,
    affectedCount,
  };
}
