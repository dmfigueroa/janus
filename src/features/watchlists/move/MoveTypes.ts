import type { WatchlistItemOrderMode } from "@/features/watchlists/Order";
import type { MoveItemFailureCode } from "@/features/watchlists/Errors.server";

export type { MoveItemFailureCode };

export type MoveItemFailureResult = {
  success: false;
  code: MoveItemFailureCode;
  message: string;
};

export type MoveItemResult =
  | { success: true; movedCount: number; message: string }
  | MoveItemFailureResult;

export type MoveDestination = {
  id: number;
  name: string;
  itemOrderMode: WatchlistItemOrderMode;
};
