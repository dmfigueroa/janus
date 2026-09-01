import { z } from "zod";
import type { WatchlistListOrder } from "./Query.server";

const cursorSchema = z.object({
  offset: z.number().int().nonnegative(),
  orderBy: z.string(),
  order: z.enum(["asc", "desc"]),
  searchQuery: z.string().optional(),
});

export function encodeWatchlistCursor(
  offset: number,
  orderBy: WatchlistListOrder,
  order: "asc" | "desc",
  searchQuery?: string,
) {
  return Buffer.from(JSON.stringify({ offset, orderBy, order, searchQuery })).toString("base64url");
}

export function decodeWatchlistCursor(
  cursor: string,
  orderBy: WatchlistListOrder,
  order: "asc" | "desc",
  searchQuery?: string,
) {
  const decoded = cursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
  const cursorMatches = [
    decoded.orderBy === orderBy,
    decoded.order === order,
    decoded.searchQuery === searchQuery,
  ].every(Boolean);

  if (!cursorMatches) {
    throw new Error("Invalid watchlist cursor.");
  }

  return decoded.offset;
}
