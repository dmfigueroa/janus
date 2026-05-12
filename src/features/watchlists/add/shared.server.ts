import { type WatchlistAddRejection } from "@/server/media";

export type WatchlistWriteResult = { success: true; message: string } | WatchlistAddRejection;

export const rejectAdd = (message: string): WatchlistAddRejection => ({
  success: false,
  message,
});
