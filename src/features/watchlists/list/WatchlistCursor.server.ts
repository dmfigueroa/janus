import { z } from "zod";
import type { WatchlistListOrder } from "./Query.server";

const cursorSchema = z.object({
  offset: z.number().int().nonnegative(),
  orderBy: z.string(),
  order: z.enum(["asc", "desc"]),
});

export function encodeWatchlistCursor(
  offset: number,
  orderBy: WatchlistListOrder,
  order: "asc" | "desc",
) {
  return Buffer.from(JSON.stringify({ offset, orderBy, order })).toString("base64url");
}

export function decodeWatchlistCursor(
  cursor: string,
  orderBy: WatchlistListOrder,
  order: "asc" | "desc",
) {
  const decoded = cursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));

  if (decoded.orderBy !== orderBy || decoded.order !== order) {
    throw new Error("Invalid watchlist cursor.");
  }

  return decoded.offset;
}
