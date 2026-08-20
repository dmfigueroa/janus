import { type WatchlistAddRejection } from "@/server/Media";

export type WatchlistWriteResult = { success: true; message: string } | WatchlistAddRejection;

export const rejectAdd = (message: string): WatchlistAddRejection => ({
  success: false,
  message,
});
