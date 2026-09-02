import { type WatchlistAddRejection } from "@/server/Media";

export type WatchlistWriteFailureCode =
  | "not_found"
  | "insertion_choice_required"
  | "not_custom_mode"
  | "invalid_reference"
  | "validation_error"
  | "unsupported";

export type WatchlistWriteResult =
  | { success: true; message: string }
  | ({ success: false; message: string } & WatchlistAddRejection &
      Partial<{ code: WatchlistWriteFailureCode }>);

export type WatchlistWriteFailure = {
  success: false;
  code: WatchlistWriteFailureCode;
  message: string;
};

export const rejectAdd = (
  message: string,
  code: WatchlistWriteFailureCode = "validation_error",
): WatchlistWriteFailure => ({
  success: false,
  code,
  message,
});
